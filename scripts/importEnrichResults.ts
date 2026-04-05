//importujemy pliki z zewnętrznego źródła (np. z Apify) do naszej bazy danych Supabase, aktualizując istniejące rekordy firm o nowe kontakty (email, telefon) i odświeżając ich status i quality_score zgodnie z logiką biznesową. Skrypt czyta dane z pliku CSV,
// normalizuje je, sprawdza istnienie firmy w bazie, dodaje brakujące kontakty i aktualizuje status firmy.
// Na koniec wypisuje statystyki importu.

import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { supabaseAdmin as supabase } from "../src/lib/core/supabaseAdmin";
import {
  normalizeEmail,
  normalizePhone,
} from "../src/lib/core/contactNormalization";
import { refreshCompanyStatusAndQuality } from "../src/lib/core/companyStatus";
import { addContactIfMissing } from "../src/lib/core/contactStore";

type CsvRow = {
  companyId?: string;
  email?: string;
  phone?: string;
  country?: string;
  source?: string;
  foundEmail?: string;
  foundPhone?: string;
};

async function ensureCompanyExists(companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .single();

  if (error) {
    throw new Error(`Nie znaleziono firmy ${companyId}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Nie znaleziono firmy ${companyId}`);
  }

  return data;
}

async function main() {
  const filePath = path.join(process.cwd(), "data", "enrichResults.csv");
  const fileContent = await fs.readFile(filePath, "utf8");

  const parsed = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  console.log(`Wczytano rekordow enrich: ${parsed.length}`);

  if (parsed.length === 0) {
    console.log("Brak rekordow do importu.");
    return;
  }

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let addedEmailCount = 0;
  let addedPhoneCount = 0;

  for (const row of parsed) {
    try {
      const companyId = row.companyId?.trim();

      if (!companyId) {
        throw new Error("Brak companyId");
      }

      await ensureCompanyExists(companyId);

      const email = normalizeEmail(row.email ?? row.foundEmail);
      const phone = normalizePhone(row.phone ?? row.foundPhone, row.country);
      const source = row.source?.trim() || "enrichImport";

      if (!email && !phone) {
        skippedCount += 1;
        console.log(`[SKIP] ${companyId} - brak email i phone`);
        continue;
      }

      if (email) {
        const insertedEmail = await addContactIfMissing({
          companyId,
          contactType: "email",
          contactValue: email,
          normalizedValue: email,
          source,
        });

        if (insertedEmail) {
          addedEmailCount += 1;
        }
      }

      if (phone) {
        const insertedPhone = await addContactIfMissing({
          companyId,
          contactType: "phone",
          contactValue: row.phone ?? row.foundPhone ?? phone,
          normalizedValue: phone,
          source,
        });

        if (insertedPhone) {
          addedPhoneCount += 1;
        }
      }

      await refreshCompanyStatusAndQuality(companyId);

      processedCount += 1;
      console.log(`[OK] ${companyId}`);
    } catch (error) {
      errorCount += 1;

      const errorMessage =
        error instanceof Error ? error.message : "Nieznany blad";

      console.error(
        `[ERR] ${row.companyId ?? "brakCompanyId"}: ${errorMessage}`,
      );
    }
  }

  console.log("Import enrich zakonczony.");
  console.log(`processedCount=${processedCount}`);
  console.log(`skippedCount=${skippedCount}`);
  console.log(`errorCount=${errorCount}`);
  console.log(`addedEmailCount=${addedEmailCount}`);
  console.log(`addedPhoneCount=${addedPhoneCount}`);
}

main().catch((error) => {
  console.error("Skrypt importEnrichResults nie udal sie:");
  console.error(error);
  process.exit(1);
});
