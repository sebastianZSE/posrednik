// Diagnoza (TYLKO ODCZYT): ile e-maili typu noreply/postmaster ma status
// validLike, czyli mogłoby trafić do kampanii mailowej.
// Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testNoreplyEmails.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);

const WZORCE = [
  "noreply%",
  "no-reply%",
  "no_reply%",
  "donotreply%",
  "do-not-reply%",
  "postmaster%",
  "mailer-daemon%",
];

let lacznie = 0;

for (const wzorzec of WZORCE) {
  const { data, error } = await supabase
    .from("company_contacts")
    .select("contact_value, validation_status, is_primary")
    .eq("contact_type", "email")
    .ilike("contact_value", wzorzec);

  if (error) {
    console.log(`Błąd dla wzorca ${wzorzec}:`, error.message);
    process.exit(1);
  }

  const validLike = data.filter((c) => c.validation_status === "validLike");
  const primary = validLike.filter((c) => c.is_primary);

  if (data.length > 0) {
    console.log(
      `${wzorzec}: znalezione ${data.length} | validLike (poszłyby do kampanii): ${validLike.length} | w tym primary: ${primary.length}`,
    );
    for (const c of validLike.slice(0, 3)) {
      console.log(`   np. ${c.contact_value}`);
    }
  }

  lacznie += validLike.length;
}

console.log("");
console.log(
  lacznie === 0
    ? "TEST-OK: zero adresów noreply/postmaster w puli kampanijnej — temat można zamknąć."
    : `UWAGA: ${lacznie} adresów noreply/postmaster przeszłoby do kampanii — warto dodać je do blocklisty.`,
);
