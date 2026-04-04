//importujemy pliki z zewnętrznego źródła (np. z Apify) do naszej bazy danych Supabase, aktualizując istniejące rekordy firm o nowe kontakty (email, telefon) i odświeżając ich status i quality_score zgodnie z logiką biznesową. Skrypt czyta dane z pliku CSV,
// normalizuje je, sprawdza istnienie firmy w bazie, dodaje brakujące kontakty i aktualizuje status firmy.
// Na koniec wypisuje statystyki importu.

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL w .env.local");
}

if (!serviceRoleKey) {
  throw new Error("Brakuje SUPABASE_SERVICE_ROLE_KEY w .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

type CsvRow = {
  companyId?: string;
  email?: string;
  phone?: string;
  country?: string;
  source?: string;
  foundEmail?: string;
  foundPhone?: string;
};

type CompanyBaseRow = {
  id: string;
  domain: string | null;
  address: string | null;
  city: string | null;
};

type CompanyContactRow = {
  contact_type: "phone" | "email";
};

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;

  const normalized = email.trim().toLowerCase();

  if (!normalized.includes("@")) return null;

  return normalized;
}

function normalizePhone(
  phone: string | null | undefined,
  country: string | null | undefined,
): string | null {
  if (!phone) return null;

  const countryCode =
    country && typeof country === "string"
      ? country.trim().toUpperCase()
      : undefined;

  try {
    const parsed = parsePhoneNumberFromString(
      phone,
      countryCode as "DE" | "AT" | "CH" | undefined,
    );

    if (parsed?.isValid()) {
      return parsed.number;
    }
  } catch {}

  const fallback = phone
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+");

  return fallback || null;
}

function calculateLeadStatus(params: { hasEmail: boolean; hasPhone: boolean }) {
  if (params.hasEmail && params.hasPhone) return "ready";
  if (params.hasEmail || params.hasPhone) return "enrich";
  return "skip";
}

function calculateQualityScore(params: {
  domain: string | null;
  address: string | null;
  city: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  let score = 0;

  if (params.domain) score += 2;
  if (params.hasEmail) score += 2;
  if (params.hasPhone) score += 2;
  if (params.address) score += 1;
  if (params.city) score += 1;

  return score;
}

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

async function addContactIfMissing(params: {
  companyId: string;
  contactType: "phone" | "email";
  contactValue: string;
  normalizedValue: string;
  source: string;
}) {
  const { data: existingContact, error: findError } = await supabase
    .from("company_contacts")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("contact_type", params.contactType)
    .eq("normalized_value", params.normalizedValue)
    .limit(1);

  if (findError) {
    throw new Error(`Blad przy szukaniu kontaktu: ${findError.message}`);
  }

  if (existingContact && existingContact.length > 0) {
    return false;
  }

  const { count, error: countError } = await supabase
    .from("company_contacts")
    .select("*", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .eq("contact_type", params.contactType);

  if (countError) {
    throw new Error(`Blad przy liczeniu kontaktow: ${countError.message}`);
  }

  const isPrimary = (count ?? 0) === 0;

  const { error: insertError } = await supabase
    .from("company_contacts")
    .insert({
      company_id: params.companyId,
      contact_type: params.contactType,
      contact_value: params.contactValue,
      normalized_value: params.normalizedValue,
      is_primary: isPrimary,
      is_verified: false,
      source: params.source,
    });

  if (insertError) {
    throw new Error(`Blad przy dodawaniu kontaktu: ${insertError.message}`);
  }

  return true;
}

async function refreshCompanyStatusAndQuality(companyId: string) {
  const { data: companyData, error: companyError } = await supabase
    .from("companies")
    .select("id, domain, address, city")
    .eq("id", companyId)
    .single();

  if (companyError) {
    throw new Error(
      `Blad przy pobieraniu firmy do refresh: ${companyError.message}`,
    );
  }

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select("contact_type")
    .eq("company_id", companyId);

  if (contactsError) {
    throw new Error(
      `Blad przy pobieraniu kontaktow do refresh: ${contactsError.message}`,
    );
  }

  const company = companyData as CompanyBaseRow;
  const contacts = (contactsData ?? []) as CompanyContactRow[];

  const hasEmail = contacts.some((contact) => contact.contact_type === "email");
  const hasPhone = contacts.some((contact) => contact.contact_type === "phone");

  const status = calculateLeadStatus({
    hasEmail,
    hasPhone,
  });

  const qualityScore = calculateQualityScore({
    domain: company.domain,
    address: company.address,
    city: company.city,
    hasEmail,
    hasPhone,
  });

  const { error: updateError } = await supabase
    .from("companies")
    .update({
      status,
      quality_score: qualityScore,
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  if (updateError) {
    throw new Error(
      `Blad przy refresh status i qualityScore: ${updateError.message}`,
    );
  }
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
