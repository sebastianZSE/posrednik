// Jednorazowe uzupełnienie pustego kraju na 'DE' (cała baza jest niemiecka).
// TRYB PRÓBNY (domyślny):
//   node --env-file=.env.local scripts/backfillCountryDe.mjs
// WYKONANIE:
//   node --env-file=.env.local scripts/backfillCountryDe.mjs --wykonaj

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
  .is("country", null);

if (countError) {
  console.log("Błąd licznika:", countError.message);
  process.exit(1);
}

console.log(`Firmy z pustym krajem (do ustawienia DE): ${count}`);

const { data: statusy, error: sErr } = await supabase
  .from("companies")
  .select("status")
  .is("country", null);

if (!sErr) {
  const rozklad = {};
  for (const r of statusy) rozklad[r.status ?? "?"] = (rozklad[r.status ?? "?"] ?? 0) + 1;
  console.log("Rozkład statusów:", rozklad);
}

if (!WYKONAJ) {
  console.log("");
  console.log("Tryb próbny zakończony. Aby wykonać: dodaj --wykonaj");
  process.exit(0);
}

const { error: updateError } = await supabase
  .from("companies")
  .update({ country: "DE" })
  .is("country", null);

if (updateError) {
  console.log("Błąd aktualizacji:", updateError.message);
  process.exit(1);
}

const { count: pozostale, error: vErr } = await supabase
  .from("companies")
  .select("*", { count: "exact", head: true })
  .is("country", null);

if (vErr) {
  console.log("Błąd weryfikacji:", vErr.message);
  process.exit(1);
}

console.log("");
console.log(`GOTOWE. Firmy z pustym krajem po aktualizacji: ${pozostale} (oczekiwane: 0)`);
