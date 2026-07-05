// Audyt deduplikacji (TYLKO ODCZYT). Mierzy trzy ryzyka:
//  A. niescalone duplikaty: ta sama znormalizowana nazwa + kraj, rózne zapisy miasta
//  B. fałszywe scalenia: jedna firma, a jej rekordy źródłowe mają różne nazwy firm
//  C. domeny portali (facebook itp.) jako klucz scalania
// Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testDedupAudit.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);
const BATCH = 1000;

async function fetchAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) {
      console.log(`Błąd [${table}]:`, error.message);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < BATCH) return rows;
  }
}

// identyczna normalizacja jak w pipeline
function normalizeText(value) {
  if (!value) return null;
  const n = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n || null;
}
function normalizeCompanyName(name) {
  const n = normalizeText(name);
  if (!n) return null;
  return (
    n
      .replace(/\b(gmbh|mbh|ug|ag|kg|ohg|gbr|e k|ek|e u|eu|sarl|sa)\b/gu, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

const companies = await fetchAll(
  "companies",
  "id, company_name, normalized_name, domain, city, country",
);
const imports = await fetchAll(
  "imports_raw",
  "id, company_id, company_name, city",
);

console.log(`Firmy: ${companies.length} | rekordy importu: ${imports.length}`);
console.log("");

// ===== A. niescalone duplikaty: nazwa+kraj, różne miasta =====
const byNameCountry = new Map();
for (const c of companies) {
  if (!c.normalized_name) continue;
  const k = `${c.normalized_name}||${c.country ?? ""}`;
  (byNameCountry.get(k) ?? byNameCountry.set(k, []).get(k)).push(c);
}
const dupGroups = [...byNameCountry.values()].filter((g) => g.length > 1);
// z podziałem: miasta różniące się tylko zapisem (po normalizacji identyczne) = podejrzane
const suspectSameCity = dupGroups.filter((g) => {
  const norm = new Set(g.map((c) => normalizeText(c.city) ?? ""));
  return norm.size < g.length;
});

console.log(`A. Grupy firm o tej samej nazwie i kraju: ${dupGroups.length}`);
console.log(
  `   w tym z miastami różniącymi się tylko zapisem (podejrzane duplikaty): ${suspectSameCity.length}`,
);
for (const g of suspectSameCity.slice(0, 5)) {
  console.log(
    `   np. "${g[0].company_name}": miasta = ${g.map((c) => JSON.stringify(c.city)).join(" / ")}`,
  );
}
console.log("");

// ===== B. fałszywe scalenia: różne nazwy w rekordach źródłowych jednej firmy =====
const importsByCompany = new Map();
for (const i of imports) {
  if (!i.company_id) continue;
  (importsByCompany.get(i.company_id) ??
    importsByCompany.set(i.company_id, []).get(i.company_id)).push(i);
}
const falseMerges = [];
for (const [companyId, list] of importsByCompany) {
  const names = new Set(
    list.map((i) => normalizeCompanyName(i.company_name)).filter(Boolean),
  );
  if (names.size > 1) {
    falseMerges.push({ companyId, names: [...names], count: list.length });
  }
}
console.log(
  `B. Firmy scalone z rekordów o RÓŻNYCH nazwach (podejrzenie fałszywego scalenia): ${falseMerges.length}`,
);
for (const f of falseMerges.slice(0, 5)) {
  console.log(`   np. companyId=${f.companyId}: ${f.names.join(" | ")}`);
}
console.log("");

// ===== C. domeny portali =====
const PORTALE = [
  "facebook.com", "instagram.com", "google.com", "linkedin.com",
  "xing.com", "youtube.com", "wordpress.com", "wixsite.com", "jimdo.com",
];
const portalCompanies = companies.filter(
  (c) => c.domain && PORTALE.some((p) => c.domain === p || c.domain.endsWith("." + p)),
);
console.log(`C. Firmy z domeną portalu (ryzyko sklejenia po domenie): ${portalCompanies.length}`);
for (const c of portalCompanies.slice(0, 5)) {
  console.log(`   np. "${c.company_name}" | domain=${c.domain}`);
}
console.log("");

const ok =
  suspectSameCity.length === 0 &&
  falseMerges.length === 0 &&
  portalCompanies.length === 0;
console.log(
  ok
    ? "TEST-OK: brak wykrytych problemów deduplikacji."
    : "UWAGA: są znaleziska — omówimy je przed jakąkolwiek zmianą.",
);
