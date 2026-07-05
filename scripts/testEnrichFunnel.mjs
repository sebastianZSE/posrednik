// Diagnoza lejka enrichmentu (TYLKO ODCZYT): ile firm czeka, ile przepadło,
// ile wyczerpało próby. Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testEnrichFunnel.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function count(build) {
  const { count: c, error } = await build();
  if (error) {
    console.log("Błąd:", error.message);
    process.exit(1);
  }
  return c;
}

const base = () =>
  supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("status", "enrich");

const total = await count(base);
const bezWww = await count(() => base().is("website", null));

console.log(`Firmy w kolejce enrich: ${total}`);
console.log(`  bez strony WWW (enrichment niemożliwy): ${bezWww}`);
console.log("");
console.log("Rozkład website_enrich_status (firmy ze stroną):");

for (const s of ["new", "success", "no_contact_found", "error"]) {
  const c = await count(() =>
    base().not("website", "is", null).eq("website_enrich_status", s),
  );
  console.log(`  ${s}: ${c}`);
}

const brakStatusu = await count(() =>
  base().not("website", "is", null).is("website_enrich_status", null),
);
console.log(`  (null / nigdy nie próbowano): ${brakStatusu}`);

const wyczerpane = await count(() =>
  base()
    .not("website", "is", null)
    .in("website_enrich_status", ["error"])
    .gte("website_enrich_attempts", 3),
);
console.log("");
console.log(`Firmy z wyczerpanymi próbami (error, attempts>=3): ${wyczerpane}`);
console.log(
  "Kandydaci do odzyskania po ulepszeniu ekstrakcji: no_contact_found + wyczerpane błędy.",
);
