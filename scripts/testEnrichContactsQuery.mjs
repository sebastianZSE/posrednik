// Test kompletności (tylko odczyt): czy nowe zapytanie o kontakty w /enrichQueue
// zwraca WSZYSTKIE kontakty firm ze statusem enrich.
// Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testEnrichContactsQuery.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);

// Dokładna liczba wszystkich kontaktów w bazie (sam licznik, bez limitu wierszy)
const { count: totalContacts, error: e0 } = await supabase
  .from("company_contacts")
  .select("*", { count: "exact", head: true });

// Dokładna liczba kontaktów firm enrich (licznik na złączeniu)
const { count: enrichContactsExact, error: e1 } = await supabase
  .from("company_contacts")
  .select("id, companies!inner(status)", { count: "exact", head: true })
  .eq("companies.status", "enrich");

// Nowe zapytanie strony (pobranie wierszy)
const { data: newContacts, error: e2 } = await supabase
  .from("company_contacts")
  .select("id, company_id, companies!inner(status)")
  .eq("companies.status", "enrich");

if (e0 || e1 || e2) {
  console.log("Błędy:", e0?.message, e1?.message, e2?.message);
  process.exit(1);
}

console.log("Wszystkie kontakty w bazie (dokładny licznik):", totalContacts);
console.log("Kontakty firm enrich (dokładny licznik):", enrichContactsExact);
console.log("Kontakty zwrócone nowym zapytaniem strony:", newContacts.length);
console.log(
  newContacts.length === enrichContactsExact
    ? "TEST-OK: nowe zapytanie zwraca komplet danych"
    : "TEST-UWAGA: nowe zapytanie zwraca " +
        newContacts.length +
        " z " +
        enrichContactsExact +
        " — kolejka przekracza limit wierszy, potrzebna paginacja zapytania",
);
console.log(
  "Stara wersja strony pobierała maksymalnie 5000 z " +
    totalContacts +
    " kontaktów" +
    (totalContacts > 5000 ? " — czyli GUBIŁA dane." : "."),
);
