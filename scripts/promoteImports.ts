// jak działa ten skrypt
// Po kolei:
// 1
// Pobiera rekordy z imports_raw, które mają:
// promotion_status = new
// Czyli bierze tylko te surowe rekordy, które jeszcze nie były obrabiane.
// 2
// Dla każdego rekordu:
// czyści nazwę firmy,
// wyciąga domenę ze strony,
// normalizuje email,
// normalizuje telefon.
// 3
// Sprawdza, czy firma już istnieje:
// najpierw po domain,
// jeśli nie ma domeny, to po normalized_name + city + country.
// To jest celowo proste i bezpieczne.
// 4
// Jeśli firmy nie ma:
// tworzy nowy rekord w companies.
// Jeśli firma już jest:
// uzupełnia jej brakujące pola.
// 5
// Dodaje kontakty do company_contacts:
// email
// phone
// Jeśli kontakt już istnieje, nie dodaje go drugi raz.
// 6
// Na końcu oznacza rekord w imports_raw jako:
// promoted
//  albo
// error

import { config } from "dotenv";
config({ path: ".env.local" });

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

type ImportRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  category: string | null;
  source: string | null;
  promotion_status: string | null;
};

type CompanyRow = {
  id: string;
  company_name: string | null;
  normalized_name: string | null;
  legal_name: string | null;
  website: string | null;
  domain: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  category: string | null;
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

function normalizeText(value: string | null): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function normalizeCompanyName(companyName: string | null): string | null {
  const normalized = normalizeText(companyName);

  if (!normalized) return null;

  const cleaned = normalized
    .replace(/\b(gmbh|mbh|ug|ag|kg|ohg|gbr|e k|ek|e u|eu|sarl|sa)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function normalizeDomain(website: string | null): string | null {
  if (!website) return null;

  try {
    const withProtocol = website.startsWith("http")
      ? website
      : `https://${website}`;

    const url = new URL(withProtocol);
    const hostname = url.hostname
      .replace(/^www\./, "")
      .trim()
      .toLowerCase();

    return hostname || null;
  } catch {
    return null;
  }
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;

  const normalized = email.trim().toLowerCase();

  if (!normalized.includes("@")) return null;

  return normalized;
}

function normalizePhone(
  phone: string | null,
  country: string | null,
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

async function findExistingCompany(params: {
  normalizedName: string | null;
  domain: string | null;
  city: string | null;
  country: string | null;
  normalizedPhone: string | null;
}) {
  if (params.domain) {
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, company_name, normalized_name, legal_name, website, domain, address, city, postal_code, country, category",
      )
      .eq("domain", params.domain)
      .limit(1);

    if (error) {
      throw new Error(`Blad przy szukaniu firmy po domenie: ${error.message}`);
    }

    if (data && data.length > 0) {
      return data[0] as CompanyRow;
    }
  }

  if (params.normalizedPhone) {
    const { data: contactData, error: contactError } = await supabase
      .from("company_contacts")
      .select("company_id")
      .eq("contact_type", "phone")
      .eq("normalized_value", params.normalizedPhone)
      .limit(1);

    if (contactError) {
      throw new Error(
        `Blad przy szukaniu firmy po telefonie: ${contactError.message}`,
      );
    }

    if (contactData && contactData.length > 0) {
      const companyId = contactData[0].company_id;

      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select(
          "id, company_name, normalized_name, legal_name, website, domain, address, city, postal_code, country, category",
        )
        .eq("id", companyId)
        .limit(1);

      if (companyError) {
        throw new Error(
          `Blad przy pobieraniu firmy po telefonie: ${companyError.message}`,
        );
      }

      if (companyData && companyData.length > 0) {
        return companyData[0] as CompanyRow;
      }
    }
  }

  if (params.normalizedName && params.city && params.country) {
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, company_name, normalized_name, legal_name, website, domain, address, city, postal_code, country, category",
      )
      .eq("normalized_name", params.normalizedName)
      .eq("city", params.city)
      .eq("country", params.country)
      .limit(1);

    if (error) {
      throw new Error(
        `Blad przy szukaniu firmy po nazwie i miescie: ${error.message}`,
      );
    }

    if (data && data.length > 0) {
      return data[0] as CompanyRow;
    }
  }

  return null;
}

async function updateExistingCompany(params: {
  company: CompanyRow;
  website: string | null;
  domain: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  category: string | null;
}) {
  const patch: Record<string, unknown> = {};

  if (!params.company.website && params.website) patch.website = params.website;
  if (!params.company.domain && params.domain) patch.domain = params.domain;
  if (!params.company.address && params.address) patch.address = params.address;
  if (!params.company.city && params.city) patch.city = params.city;
  if (!params.company.postal_code && params.postalCode)
    patch.postal_code = params.postalCode;
  if (!params.company.country && params.country) patch.country = params.country;
  if (!params.company.category && params.category)
    patch.category = params.category;

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", params.company.id);

  if (error) {
    throw new Error(`Blad przy aktualizacji firmy: ${error.message}`);
  }
}

async function createCompany(params: {
  companyName: string;
  normalizedName: string;
  website: string | null;
  domain: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
}) {
  const status = calculateLeadStatus({
    hasEmail: Boolean(params.email),
    hasPhone: Boolean(params.phone),
  });

  const qualityScore = calculateQualityScore({
    domain: params.domain,
    address: params.address,
    city: params.city,
    hasEmail: Boolean(params.email),
    hasPhone: Boolean(params.phone),
  });

  const { data, error } = await supabase
    .from("companies")
    .insert({
      company_name: params.companyName,
      normalized_name: params.normalizedName,
      legal_name: params.companyName,
      website: params.website,
      domain: params.domain,
      address: params.address,
      city: params.city,
      postal_code: params.postalCode,
      country: params.country,
      category: params.category,
      status,
      quality_score: qualityScore,
    })
    .select(
      "id, company_name, normalized_name, legal_name, website, domain, address, city, postal_code, country, category",
    )
    .single();

  if (error) {
    throw new Error(`Blad przy tworzeniu firmy: ${error.message}`);
  }

  return data as CompanyRow;
}

async function addContact(params: {
  companyId: string;
  contactType: "phone" | "email";
  contactValue: string | null;
  normalizedValue: string | null;
  source: string | null;
}) {
  if (!params.contactValue || !params.normalizedValue) {
    return;
  }

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
    return;
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
      source: params.source ?? "promoteImports",
    });

  if (insertError) {
    throw new Error(`Blad przy dodawaniu kontaktu: ${insertError.message}`);
  }
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

async function markImportAsPromoted(params: {
  importId: string;
  companyId: string;
}) {
  const { error } = await supabase
    .from("imports_raw")
    .update({
      promotion_status: "promoted",
      promoted_at: new Date().toISOString(),
      promotion_error: null,
      company_id: params.companyId,
    })
    .eq("id", params.importId);

  if (error) {
    throw new Error(
      `Blad przy oznaczaniu importu jako promoted: ${error.message}`,
    );
  }
}

async function markImportAsError(params: {
  importId: string;
  errorMessage: string;
}) {
  const { error } = await supabase
    .from("imports_raw")
    .update({
      promotion_status: "error",
      promotion_error: params.errorMessage,
    })
    .eq("id", params.importId);

  if (error) {
    throw new Error(
      `Blad przy oznaczaniu importu jako error: ${error.message}`,
    );
  }
}

async function main() {
  const { data, error } = await supabase
    .from("imports_raw")
    .select(
      "id, company_name, website, email, phone, address, city, postal_code, country, category, source, promotion_status",
    )
    .eq("promotion_status", "new")
    .order("imported_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`Blad przy pobieraniu imports_raw: ${error.message}`);
  }

  const rows = (data ?? []) as ImportRow[];

  console.log(`Znaleziono rekordow do przeniesienia: ${rows.length}`);

  if (rows.length === 0) {
    console.log("Brak rekordow do przeniesienia.");
    return;
  }

  let promotedCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      if (!row.company_name) {
        throw new Error("Brak company_name");
      }

      const normalizedName = normalizeCompanyName(row.company_name);

      if (!normalizedName) {
        throw new Error("Nie udalo sie znormalizowac nazwy firmy");
      }

      const domain = normalizeDomain(row.website);
      const normalizedEmail = normalizeEmail(row.email);
      const normalizedPhone = normalizePhone(row.phone, row.country);

      let company = await findExistingCompany({
        normalizedName,
        domain,
        city: row.city,
        country: row.country,
        normalizedPhone,
      });

      if (!company) {
        company = await createCompany({
          companyName: row.company_name,
          normalizedName,
          website: row.website,
          domain,
          address: row.address,
          city: row.city,
          postalCode: row.postal_code,
          country: row.country,
          category: row.category,
          email: normalizedEmail,
          phone: normalizedPhone,
        });
      } else {
        await updateExistingCompany({
          company,
          website: row.website,
          domain,
          address: row.address,
          city: row.city,
          postalCode: row.postal_code,
          country: row.country,
          category: row.category,
        });
      }

      await addContact({
        companyId: company.id,
        contactType: "email",
        contactValue: row.email,
        normalizedValue: normalizedEmail,
        source: row.source,
      });

      await addContact({
        companyId: company.id,
        contactType: "phone",
        contactValue: row.phone,
        normalizedValue: normalizedPhone,
        source: row.source,
      });

      await refreshCompanyStatusAndQuality(company.id);

      await markImportAsPromoted({
        importId: row.id,
        companyId: company.id,
      });

      promotedCount += 1;
      console.log(`[OK] ${row.company_name}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nieznany blad";

      errorCount += 1;

      await markImportAsError({
        importId: row.id,
        errorMessage,
      });

      console.error(`[ERR] ${row.company_name ?? row.id}: ${errorMessage}`);
    }
  }

  console.log(
    `Gotowe. promotedCount=${promotedCount}, errorCount=${errorCount}`,
  );
}

main().catch((error) => {
  console.error("Skrypt promoteImports nie udal sie:");
  console.error(error);
  process.exit(1);
});
