// Pogłębiony audyt fałszywych scaleń (TYLKO ODCZYT).
// Dla firm scalonych z rekordów o różnych nazwach ustala:
//  - czy to warianty nazwy tej samej firmy (niegroźne), czy różne firmy (szkoda),
//  - który klucz je skleił: wspólna domena czy wspólny telefon.
// Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testFalseMergeCauses.mjs

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
function normalizeDomain(website) {
  if (!website) return null;
  try {
    const withProto = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const host = new URL(withProto).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
function normalizePhoneDigits(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

// tokeny zbyt ogólne, by świadczyć o tożsamości firmy
const GENERYCZNE = new Set([
  "elektro", "elektrotechnik", "elektroinstallation", "elektroinstallationen",
  "elektroservice", "elektroanlagen", "elektronik", "elektrogeschaft",
  "installation", "technik", "service", "meisterbetrieb", "inhaber",
  "und", "der", "die", "das", "co",
]);

function znaczaceTokeny(name) {
  return new Set(
    (name ?? "")
      .split(" ")
      .filter((t) => t.length >= 4 && !GENERYCZNE.has(t)),
  );
}

function czyWariantyJednejFirmy(names) {
  // wariant: każda para nazw dzieli co najmniej jeden znaczący token
  const tokenSets = names.map(znaczaceTokeny);
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const wspolne = [...tokenSets[i]].some((t) => tokenSets[j].has(t));
      if (!wspolne) return false;
    }
  }
  return true;
}

const companies = await fetchAll("companies", "id, company_name, domain, city, status");
const imports = await fetchAll(
  "imports_raw",
  "id, company_id, company_name, website, phone, city",
);
const companyById = new Map(companies.map((c) => [c.id, c]));
const importsByCompany = new Map();
for (const i of imports) {
  if (!i.company_id) continue;
  (importsByCompany.get(i.company_id) ??
    importsByCompany.set(i.company_id, []).get(i.company_id)).push(i);
}

const podejrzane = [];
for (const [companyId, list] of importsByCompany) {
  const names = [
    ...new Set(list.map((i) => normalizeCompanyName(i.company_name)).filter(Boolean)),
  ];
  if (names.length > 1) podejrzane.push({ companyId, list, names });
}

let warianty = 0;
const szkodliwe = [];

for (const p of podejrzane) {
  if (czyWariantyJednejFirmy(p.names)) {
    warianty++;
    continue;
  }

  // ustal klucz sklejenia
  const domeny = new Set(p.list.map((i) => normalizeDomain(i.website)).filter(Boolean));
  const telefony = new Set(p.list.map((i) => normalizePhoneDigits(i.phone)).filter(Boolean));
  const firma = companyById.get(p.companyId);

  let przyczyna = "niejasna";
  if (domeny.size === 1 && p.list.filter((i) => i.website).length > 1) {
    przyczyna = `wspólna domena: ${[...domeny][0]}`;
  } else if (telefony.size === 1 && p.list.filter((i) => i.phone).length > 1) {
    przyczyna = `wspólny telefon: ${[...telefony][0]}`;
  } else if (domeny.size === 1 && telefony.size === 1) {
    przyczyna = `domena ${[...domeny][0]} lub telefon`;
  } else if (domeny.size > 1 && telefony.size <= 1) {
    przyczyna = telefony.size === 1 ? `wspólny telefon: ${[...telefony][0]}` : "niejasna (różne domeny i telefony)";
  }

  szkodliwe.push({
    companyId: p.companyId,
    nazwaRekordu: firma?.company_name ?? "?",
    status: firma?.status ?? "?",
    domenaRekordu: firma?.domain ?? "—",
    liczbaNazw: p.names.length,
    liczbaImportow: p.list.length,
    przyczyna,
    nazwy: p.names.slice(0, 4),
  });
}

szkodliwe.sort((a, b) => b.liczbaNazw - a.liczbaNazw);

console.log(`Firmy z rekordów o różnych nazwach: ${podejrzane.length}`);
console.log(`  warianty nazwy tej samej firmy (niegroźne): ${warianty}`);
console.log(`  RÓŻNE firmy sklejone w jeden rekord (szkody): ${szkodliwe.length}`);
console.log("");

for (const s of szkodliwe.slice(0, 10)) {
  console.log(`- "${s.nazwaRekordu}" [status=${s.status}]`);
  console.log(`    sklejonych nazw: ${s.liczbaNazw} | importów: ${s.liczbaImportow} | domena rekordu: ${s.domenaRekordu}`);
  console.log(`    przyczyna: ${s.przyczyna}`);
  console.log(`    przykłady nazw: ${s.nazwy.join(" | ")}`);
}

const sumaSklejonychNazw = szkodliwe.reduce((s, x) => s + x.liczbaNazw, 0);
console.log("");
console.log(
  `Szacowana liczba utraconych firm (nazwy uwięzione w cudzych rekordach): ~${sumaSklejonychNazw - szkodliwe.length}`,
);
console.log(`Ile szkodliwych rekordów ma status ready (ryzyko dla kampanii): ${szkodliwe.filter((s) => s.status === "ready").length}`);
