// Reset firm "no_contact_found" do ponownej próby enrichmentu po ulepszeniu
// ekstrakcji (dekoder anty-spamowy, przekierowania, freemail).
//
// TRYB PRÓBNY (domyślny): tylko pokazuje, ile firm objąłby reset.
//   node --env-file=.env.local scripts/resetNoContactFound.mjs
// WYKONANIE:
//   node --env-file=.env.local scripts/resetNoContactFound.mjs --wykonaj
//
// Zmienia WYŁĄCZNIE pola śledzenia enrichmentu (website_enrich_status -> 'new',
// attempts -> 0). Statusy firm, kontakty i dane pozostają nietknięte.

import { createClient } from "@supabase/supabase-js";

const WYKONAJ = process.argv.includes("--wykonaj");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);

console.log(WYKONAJ ? ">>> TRYB WYKONANIA <<<" : ">>> TRYB PRÓBNY (bez zmian) <<<");
console.log("");

const { count, error: countError } = await supabase
  .from("companies")
  .select("*", { count: "exact", head: true })
  .eq("status", "enrich")
  .eq("website_enrich_status", "no_contact_found")
  .not("website", "is", null);

if (countError) {
  console.log("Błąd licznika:", countError.message);
  process.exit(1);
}

console.log(`Firmy no_contact_found do resetu: ${count}`);

if (!WYKONAJ) {
  console.log("");
  console.log("Tryb próbny zakończony. Aby wykonać: dodaj --wykonaj");
  process.exit(0);
}

const { error: updateError } = await supabase
  .from("companies")
  .update({
    website_enrich_status: "new",
    website_enrich_attempts: 0,
    website_enrich_error: null,
  })
  .eq("status", "enrich")
  .eq("website_enrich_status", "no_contact_found")
  .not("website", "is", null);

if (updateError) {
  console.log("Błąd resetu:", updateError.message);
  process.exit(1);
}

const { count: poResecie, error: verifyError } = await supabase
  .from("companies")
  .select("*", { count: "exact", head: true })
  .eq("status", "enrich")
  .eq("website_enrich_status", "new")
  .not("website", "is", null);

if (verifyError) {
  console.log("Błąd weryfikacji:", verifyError.message);
  process.exit(1);
}

console.log("");
console.log(`GOTOWE. Firmy oczekujące na enrichment (new): ${poResecie}`);
console.log("Uruchamiaj porcjami: npm run enrich:deWebsites (25 firm na przebieg).");
