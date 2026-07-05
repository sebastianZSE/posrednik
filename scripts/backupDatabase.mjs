// Backup bazy Supabase do lokalnych plików JSON (z bazy TYLKO CZYTA).
// Zapisuje do: backups/<RRRR-MM-DD_GG-MM-SS>/<tabela>.json
// Uruchom z katalogu my-app:
//   npm run backup:db
// lub:
//   node --env-file=.env.local scripts/backupDatabase.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);
const BATCH = 1000;
const TABELE = ["companies", "company_contacts", "imports_raw", "import_batches"];

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) {
      throw new Error(`[${table}] ${error.message}`);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < BATCH) return rows;
  }
}

async function exactCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`[${table}] licznik: ${error.message}`);
  return count;
}

const stamp = new Date()
  .toISOString()
  .slice(0, 19)
  .replace("T", "_")
  .replaceAll(":", "-");
const dir = path.join("backups", stamp);
await fs.mkdir(dir, { recursive: true });

let wszystkoOk = true;

for (const tabela of TABELE) {
  const [rows, count] = await Promise.all([fetchAll(tabela), exactCount(tabela)]);

  const filePath = path.join(dir, `${tabela}.json`);
  await fs.writeFile(filePath, JSON.stringify(rows, null, 1), "utf-8");

  // weryfikacja: odczytaj plik z dysku i policz
  const zapisane = JSON.parse(await fs.readFile(filePath, "utf-8"));
  const ok = zapisane.length === count && rows.length === count;
  if (!ok) wszystkoOk = false;

  const size = (await fs.stat(filePath)).size;
  console.log(
    `${ok ? "OK " : "BŁĄD"} ${tabela}: baza=${count} | plik=${zapisane.length} | ${(size / 1024).toFixed(0)} KB`,
  );
}

console.log("");
console.log(
  wszystkoOk
    ? `BACKUP-OK: komplet zapisany w ${dir}`
    : "BACKUP-BŁĄD: liczby się nie zgadzają — nie polegaj na tym backupie!",
);
process.exit(wszystkoOk ? 0 : 1);
