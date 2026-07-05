// Symulacja deduplikacji NA SUCHO (z bazy tylko czyta, niczego nie zapisuje).
// Przepuszcza wszystkie rekordy imports_raw przez starą i nową logikę scalania
// i porównuje wyniki. Uruchom z katalogu my-app:
//   npx tsx scripts/testDedupSimulation.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  isSharedDomain,
  hasSignificantNameOverlap,
} from "../src/lib/core/dedupGuards";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);
const BATCH = 1000;

type ImportRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  imported_at: string | null;
};

async function fetchAllImports(): Promise<ImportRow[]> {
  const rows: ImportRow[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from("imports_raw")
      .select("id, company_name, website, phone, city, country, imported_at")
      .order("imported_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) {
      console.log("Błąd:", error.message);
      process.exit(1);
    }
    rows.push(...((data ?? []) as ImportRow[]));
    if ((data ?? []).length < BATCH) return rows;
  }
}

function normalizeText(value: string | null): string | null {
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
function normalizeCompanyName(name: string | null): string | null {
  const n = normalizeText(name);
  if (!n) return null;
  return (
    n
      .replace(/\b(gmbh|mbh|ug|ag|kg|ohg|gbr|e k|ek|e u|eu|sarl|sa)\b/gu, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}
function normalizeDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const withProto = /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`;
    return new URL(withProto).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
function normalizePhoneDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

type SimCompany = {
  id: number;
  normalizedName: string | null;
  domain: string | null;
  phones: Set<string>;
  city: string | null;
  country: string | null;
  mergedNames: Set<string>;
};

function simulate(imports: ImportRow[], useGuards: boolean) {
  const companies: SimCompany[] = [];
  const byDomain = new Map<string, SimCompany[]>();
  const byPhone = new Map<string, SimCompany[]>();
  const byNameCityCountry = new Map<string, SimCompany>();

  for (const row of imports) {
    const normalizedName = normalizeCompanyName(row.company_name);
    const domain = normalizeDomain(row.website);
    const phone = normalizePhoneDigits(row.phone);

    let match: SimCompany | null = null;

    // 1. po domenie
    if (domain && (!useGuards || !isSharedDomain(domain))) {
      for (const c of byDomain.get(domain) ?? []) {
        if (
          !useGuards ||
          hasSignificantNameOverlap(normalizedName, c.normalizedName)
        ) {
          match = c;
          break;
        }
      }
    }

    // 2. po telefonie
    if (!match && phone) {
      for (const c of byPhone.get(phone) ?? []) {
        if (
          !useGuards ||
          hasSignificantNameOverlap(normalizedName, c.normalizedName)
        ) {
          match = c;
          break;
        }
      }
    }

    // 3. po nazwie + mieście + kraju (bez zmian w obu wariantach)
    if (!match && normalizedName && row.city && row.country) {
      match =
        byNameCityCountry.get(
          `${normalizedName}||${row.city}||${row.country}`,
        ) ?? null;
    }

    if (match) {
      if (normalizedName) match.mergedNames.add(normalizedName);
      if (phone) {
        match.phones.add(phone);
        (byPhone.get(phone) ?? byPhone.set(phone, []).get(phone)!).push(match);
      }
      continue;
    }

    const nowa: SimCompany = {
      id: companies.length,
      normalizedName,
      domain,
      phones: new Set(phone ? [phone] : []),
      city: row.city,
      country: row.country,
      mergedNames: new Set(normalizedName ? [normalizedName] : []),
    };
    companies.push(nowa);
    if (domain)
      (byDomain.get(domain) ?? byDomain.set(domain, []).get(domain)!).push(nowa);
    if (phone)
      (byPhone.get(phone) ?? byPhone.set(phone, []).get(phone)!).push(nowa);
    if (normalizedName && row.city && row.country)
      byNameCityCountry.set(
        `${normalizedName}||${row.city}||${row.country}`,
        nowa,
      );
  }

  const falszyweSklejenia = companies.filter((c) => {
    if (c.mergedNames.size <= 1) return false;
    const names = [...c.mergedNames];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (!hasSignificantNameOverlap(names[i], names[j])) return true;
      }
    }
    return false;
  });

  const portalowa = companies.find((c) => c.domain === "elektrikerportal.com");

  return {
    liczbaFirm: companies.length,
    falszyweSklejenia: falszyweSklejenia.length,
    portalNazwy: portalowa ? portalowa.mergedNames.size : 0,
  };
}

async function main() {
  const imports = await fetchAllImports();
  console.log(`Rekordów importu w symulacji: ${imports.length}`);
  console.log("");

  const stara = simulate(imports, false);
  const nowa = simulate(imports, true);

  console.log("                         STARA logika | NOWA logika");
  console.log(
    `Firm po symulacji:          ${String(stara.liczbaFirm).padStart(6)}    |   ${nowa.liczbaFirm}`,
  );
  console.log(
    `Fałszywych sklejeń:         ${String(stara.falszyweSklejenia).padStart(6)}    |   ${nowa.falszyweSklejenia}`,
  );
  console.log(
    `Nazw w rekordzie portalu:   ${String(stara.portalNazwy).padStart(6)}    |   ${nowa.portalNazwy}`,
  );
  console.log("");
  console.log(
    nowa.falszyweSklejenia === 0
      ? "TEST-OK: nowa logika eliminuje fałszywe sklejenia w symulacji."
      : `TEST-UWAGA: nowa logika zostawia ${nowa.falszyweSklejenia} fałszywych sklejeń — do obejrzenia.`,
  );
}

main();
