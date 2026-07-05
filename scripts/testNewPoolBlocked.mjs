// Dlaczego firmy "new" nie wchodzą do enrichmentu? (TYLKO ODCZYT)
//   node --env-file=.env.local scripts/testNewPoolBlocked.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("companies")
  .select("company_name, country, website_enrich_status, website_enrich_attempts, website")
  .eq("status", "enrich")
  .eq("website_enrich_status", "new")
  .not("website", "is", null);

if (error) {
  console.log("Błąd:", error.message);
  process.exit(1);
}

console.log(`Firmy new: ${data.length}`);

const kraje = {};
const attempts = {};
for (const c of data) {
  kraje[c.country ?? "NULL"] = (kraje[c.country ?? "NULL"] ?? 0) + 1;
  const a = c.website_enrich_attempts === null ? "NULL" : String(c.website_enrich_attempts);
  attempts[a] = (attempts[a] ?? 0) + 1;
}

console.log("Kraje:", kraje);
console.log("Attempts:", attempts);
console.log("");
for (const c of data.slice(0, 5)) {
  console.log(`- ${c.company_name} | kraj=${c.country} | attempts=${c.website_enrich_attempts}`);
}
