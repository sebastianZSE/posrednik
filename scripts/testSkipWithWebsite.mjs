// Diagnoza (TYLKO ODCZYT): ile firm ma status "skip", mimo że ma stronę WWW —
// czyli powinny być w "enrich" (kandydaci do znalezienia e-maila).
// Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testSkipWithWebsite.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function countWhere(build) {
  const { count, error } = await build();
  if (error) {
    console.log("Błąd zapytania:", error.message);
    process.exit(1);
  }
  return count;
}

const statusy = {};
for (const s of ["ready", "enrich", "skip"]) {
  statusy[s] = await countWhere(() =>
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("status", s),
  );
}

const skipZWww = await countWhere(() =>
  supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("status", "skip")
    .not("website", "is", null)
    .neq("website", ""),
);

const { data: przyklady, error: exErr } = await supabase
  .from("companies")
  .select("company_name, website, city, created_at")
  .eq("status", "skip")
  .not("website", "is", null)
  .neq("website", "")
  .order("created_at", { ascending: false })
  .limit(5);

if (exErr) {
  console.log("Błąd przykładów:", exErr.message);
  process.exit(1);
}

console.log("Statusy firm:", statusy);
console.log("");
console.log("Firmy SKIP posiadające stronę WWW (ofiary błędu):", skipZWww);
console.log("");
if (przyklady.length > 0) {
  console.log("Przykłady (5 najnowszych):");
  for (const p of przyklady) {
    console.log(` - ${p.company_name ?? "?"} | ${p.website} | ${p.city ?? "?"}`);
  }
} else {
  console.log("Brak takich firm — problem nie występuje w danych.");
}
