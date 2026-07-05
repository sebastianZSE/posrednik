// Naprawa fałszywie sklejonych firm.
//
// TRYB PRÓBNY (domyślny): tylko raportuje, co by zrobił. Niczego nie zmienia.
//   npx tsx scripts/repairFalseMerges.ts
// WYKONANIE (dopiero po obejrzeniu raportu i przy świeżym backupie!):
//   npx tsx scripts/repairFalseMerges.ts --wykonaj
//
// Operacja dla każdej sklejonej firmy:
//  1. imports_raw: promotion_status -> 'new', company_id -> null
//  2. usunięcie jej kontaktów (company_contacts)
//  3. usunięcie rekordu firmy (companies)
// Po skrypcie uruchom: npm run promote:imports oraz npm run refresh:companyStatuses

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { hasSignificantNameOverlap } from "../src/lib/core/dedupGuards";

const WYKONAJ = process.argv.includes("--wykonaj");

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

if (!url || !key) {
  console.log("Brak zmiennych środowiskowych Supabase.");
  process.exit(1);
}

const supabase = createClient(url, key);
const BATCH = 1000;

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) {
      console.log(`Błąd [${table}]:`, error.message);
      process.exit(1);
    }
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < BATCH) return rows;
  }
}

function normalizeText(value: string | null): string | null {
  if (!value) return null;
  const n = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n || null;
}
function normalizeCompanyName(name: string | null): string | null {
  const n = normalizeText(name);
  if (!n) return null;
  return (
    n
      .replace(/\b(gmbh|mbh|ug|ag|kg|ohg|gbr|e k|ek|e u|eu|sarl|sa)\b/gu, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

type CompanyRow = { id: string; company_name: string | null; status: string | null };
type ImportRow = { id: string; company_id: string | null; company_name: string | null; email: string | null };
type ContactRow = { id: string; company_id: string; contact_type: string; contact_value: string };

async function main() {
  console.log(WYKONAJ ? ">>> TRYB WYKONANIA <<<" : ">>> TRYB PRÓBNY (bez zmian w bazie) <<<");
  console.log("");

  const companies = await fetchAll<CompanyRow>("companies", "id, company_name, status");
  const imports = await fetchAll<ImportRow>("imports_raw", "id, company_id, company_name, email");
  const contacts = await fetchAll<ContactRow>("company_contacts", "id, company_id, contact_type, contact_value");

  const companyById = new Map(companies.map((c) => [c.id, c]));
  const importsByCompany = new Map<string, ImportRow[]>();
  for (const i of imports) {
    if (!i.company_id) continue;
    const list = importsByCompany.get(i.company_id) ?? [];
    list.push(i);
    importsByCompany.set(i.company_id, list);
  }
  const contactsByCompany = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const list = contactsByCompany.get(c.company_id) ?? [];
    list.push(c);
    contactsByCompany.set(c.company_id, list);
  }

  // detekcja identyczna z audytem: różne nazwy bez wspólnego znaczącego tokenu
  const doNaprawy: { company: CompanyRow; importy: ImportRow[]; kontakty: ContactRow[] }[] = [];
  for (const [companyId, list] of importsByCompany) {
    const names = [...new Set(list.map((i) => normalizeCompanyName(i.company_name)).filter(Boolean))] as string[];
    if (names.length <= 1) continue;

    let falszywe = false;
    for (let i = 0; i < names.length && !falszywe; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (!hasSignificantNameOverlap(names[i], names[j])) {
          falszywe = true;
          break;
        }
      }
    }
    if (!falszywe) continue;

    const company = companyById.get(companyId);
    if (!company) continue;
    doNaprawy.push({
      company,
      importy: list,
      kontakty: contactsByCompany.get(companyId) ?? [],
    });
  }

  // bilans e-maili
  let emaileKontakty = 0;
  let emaileOdtwarzalne = 0;
  let sumaImportow = 0;
  let sumaKontaktow = 0;

  for (const n of doNaprawy) {
    sumaImportow += n.importy.length;
    sumaKontaktow += n.kontakty.length;
    const importoweEmaile = new Set(
      n.importy.map((i) => (i.email ?? "").trim().toLowerCase()).filter(Boolean),
    );
    for (const k of n.kontakty) {
      if (k.contact_type !== "email") continue;
      emaileKontakty++;
      if (importoweEmaile.has(k.contact_value.trim().toLowerCase())) {
        emaileOdtwarzalne++;
      }
    }
  }

  console.log(`Firm do rozklejenia: ${doNaprawy.length}`);
  console.log(`Rekordów importu do cofnięcia na 'new': ${sumaImportow}`);
  console.log(`Kontaktów do usunięcia: ${sumaKontaktow}`);
  console.log(
    `E-maile w kontaktach tych firm: ${emaileKontakty} | odtworzą się z importów: ${emaileOdtwarzalne} | przepadną (enrichment, tożsamość niepewna): ${emaileKontakty - emaileOdtwarzalne}`,
  );
  console.log("");

  for (const n of doNaprawy) {
    console.log(
      `- "${n.company.company_name}" [${n.company.status}] | importów: ${n.importy.length} | kontaktów: ${n.kontakty.length}`,
    );
  }

  if (!WYKONAJ) {
    console.log("");
    console.log("Tryb próbny zakończony. Aby wykonać: npx tsx scripts/repairFalseMerges.ts --wykonaj");
    return;
  }

  console.log("");
  console.log("Wykonuję...");

  for (const n of doNaprawy) {
    const cid = n.company.id;

    const { error: e1 } = await supabase
      .from("imports_raw")
      .update({ promotion_status: "new", company_id: null })
      .eq("company_id", cid);
    if (e1) {
      console.log(`BŁĄD imports_raw dla ${cid}: ${e1.message} — przerywam.`);
      process.exit(1);
    }

    const { error: e2 } = await supabase
      .from("company_contacts")
      .delete()
      .eq("company_id", cid);
    if (e2) {
      console.log(`BŁĄD company_contacts dla ${cid}: ${e2.message} — przerywam.`);
      process.exit(1);
    }

    const { error: e3 } = await supabase.from("companies").delete().eq("id", cid);
    if (e3) {
      console.log(`BŁĄD companies dla ${cid}: ${e3.message} — przerywam.`);
      process.exit(1);
    }

    console.log(`OK usunięto "${n.company.company_name}" (${n.importy.length} importów cofniętych)`);
  }

  console.log("");
  console.log("GOTOWE. Teraz uruchom kolejno:");
  console.log("  npm run promote:imports");
  console.log("  npm run refresh:companyStatuses");
  console.log("  node --env-file=.env.local scripts/testFalseMergeCauses.mjs   (weryfikacja)");
}

main();
