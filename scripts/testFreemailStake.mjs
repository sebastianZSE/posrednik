// Stawka decyzji o freemailach (TYLKO ODCZYT): ile firm enrich ma e-mail
// freemail i skąd on pochodzi. Uruchom z katalogu my-app:
//   node --env-file=.env.local scripts/testFreemailStake.mjs

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

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de",
  "yahoo.com", "yahoo.de", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de",
  "live.com", "live.de", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "t-online.de", "freenet.de", "arcor.de",
  "online.de", "email.de", "mail.de", "posteo.de",
]);

async function fetchAll(table, select, applyFilters) {
  const rows = [];
  for (let from = 0; ; from += BATCH) {
    let q = supabase.from(table).select(select).order("id", { ascending: true }).range(from, from + BATCH - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) {
      console.log(`Błąd [${table}]:`, error.message);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < BATCH) return rows;
  }
}

const enrichCompanies = await fetchAll("companies", "id, company_name", (q) =>
  q.eq("status", "enrich"),
);
const enrichIds = new Set(enrichCompanies.map((c) => c.id));

const emailContacts = await fetchAll(
  "company_contacts",
  "company_id, contact_value, source, validation_status",
  (q) => q.eq("contact_type", "email"),
);

const firmsWithFreemail = new Map(); // companyId -> Set(sources)
let freemailContactsTotal = 0;

for (const c of emailContacts) {
  if (!enrichIds.has(c.company_id)) continue;
  const domain = (c.contact_value.split("@")[1] ?? "").trim().toLowerCase();
  if (!FREEMAIL.has(domain)) continue;
  freemailContactsTotal++;
  const s = firmsWithFreemail.get(c.company_id) ?? new Set();
  s.add(c.source ?? "brak");
  firmsWithFreemail.set(c.company_id, s);
}

const zWlasnejStrony = [...firmsWithFreemail.values()].filter((s) =>
  s.has("deWebsiteExtractor"),
).length;

const zrodla = {};
for (const s of firmsWithFreemail.values()) {
  for (const src of s) zrodla[src] = (zrodla[src] ?? 0) + 1;
}

console.log(`Firmy w kolejce enrich: ${enrichCompanies.length}`);
console.log(`Firmy enrich z co najmniej jednym freemailem: ${firmsWithFreemail.size}`);
console.log(`  w tym freemail z WŁASNEJ strony firmy (deWebsiteExtractor): ${zWlasnejStrony}`);
console.log(`Kontakty freemail łącznie u firm enrich: ${freemailContactsTotal}`);
console.log("");
console.log("Firmy wg źródła freemaila:", zrodla);
console.log("");
console.log(
  `STAWKA OPCJI 2 (freemail z własnej strony -> ready): +${zWlasnejStrony} rekordów kampanijnych (dziś, przed ponownym enrichmentem).`,
);
console.log(
  "Uwaga: po ponownym przebiegu enrichmentu z nowymi ulepszeniami ta liczba wzrośnie — dotychczas freemaile były odrzucane przy ekstrakcji.",
);
