// Test helpera fetchAllRows na żywej bazie (tylko odczyt).
// Uruchom z katalogu my-app:
//   npx tsx scripts/testFetchAllRows.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../src/lib/core/fetchAllRows";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase w .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function testTable(table: string) {
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.log(`[${table}] błąd licznika:`, countError.message);
    return false;
  }

  const { rows, error } = await fetchAllRows<{ id: string }>(() =>
    supabase
      .from(table)
      .select("id")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }),
  );

  if (error) {
    console.log(`[${table}] błąd fetchAllRows:`, error.message);
    return false;
  }

  const uniqueIds = new Set(rows.map((row) => row.id));

  console.log(
    `[${table}] licznik dokładny: ${count} | pobrano: ${rows.length} | unikalne id: ${uniqueIds.size}`,
  );

  return rows.length === count && uniqueIds.size === count;
}

async function main() {
  const okContacts = await testTable("company_contacts");
  const okCompanies = await testTable("companies");

  console.log(
    okContacts && okCompanies
      ? "TEST-OK: fetchAllRows pobiera komplet bez duplikatów"
      : "TEST-FAIL: niezgodność liczby wierszy lub duplikaty!",
  );
}

main();
