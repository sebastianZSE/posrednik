import { supabaseAdmin as supabase } from "../src/lib/core/supabaseAdmin";
import {
  normalizeEmail,
  normalizePhone,
} from "../src/lib/core/contactNormalization";
import {
  buildFailedValidationMetadata,
  CONTACT_VALIDATION_VERSION,
  validateNormalizedEmailContact,
  validatePhoneContact,
} from "../src/lib/core/contactValidation";

type ContactRow = {
  id: string;
  company_id: string;
  contact_type: "phone" | "email";
  contact_value: string;
  normalized_value: string | null;
  validation_version: string | null;
  created_at: string | null;
};

type CompanyRow = {
  id: string;
  domain: string | null;
  country: string | null;
};

const READ_BATCH_SIZE = 500;
const UPDATE_CONCURRENCY = 50;

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function loadCompaniesMap(companyIds: string[]) {
  const uniqueCompanyIds = [...new Set(companyIds)];

  if (uniqueCompanyIds.length === 0) {
    return new Map<string, CompanyRow>();
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, domain, country")
    .in("id", uniqueCompanyIds);

  if (error) {
    throw new Error(
      `Blad przy pobieraniu companies do backfill: ${error.message}`,
    );
  }

  const map = new Map<string, CompanyRow>();

  for (const row of (data ?? []) as CompanyRow[]) {
    map.set(row.id, row);
  }

  return map;
}

async function updateContactValidation(
  contact: ContactRow,
  company: CompanyRow | undefined,
) {
  const now = new Date().toISOString();

  if (contact.contact_type === "email") {
    const normalizedEmail =
      contact.normalized_value ?? normalizeEmail(contact.contact_value);

    const metadata = normalizedEmail
      ? validateNormalizedEmailContact({
          normalizedEmail,
          companyDomain: company?.domain ?? null,
        })
      : buildFailedValidationMetadata();

    const { error } = await supabase
      .from("company_contacts")
      .update({
        updated_at: now,
        validation_status: metadata.validationStatus,
        validation_checked_at: metadata.validationCheckedAt,
        validation_version: metadata.validationVersion,
        email_kind: metadata.emailKind,
        email_same_domain_as_company: metadata.emailSameDomainAsCompany,
        phone_e164: null,
        phone_country_code: null,
      })
      .eq("id", contact.id);

    if (error) {
      throw new Error(
        `Blad przy update email contact ${contact.id}: ${error.message}`,
      );
    }

    return;
  }

  const normalizedPhone =
    contact.normalized_value ??
    normalizePhone(contact.contact_value, company?.country ?? null);

  const metadata = normalizedPhone
    ? validatePhoneContact({
        rawPhone: contact.contact_value,
        normalizedPhone,
        companyCountry: company?.country ?? null,
      })
    : buildFailedValidationMetadata();

  const { error } = await supabase
    .from("company_contacts")
    .update({
      updated_at: now,
      validation_status: metadata.validationStatus,
      validation_checked_at: metadata.validationCheckedAt,
      validation_version: metadata.validationVersion,
      email_kind: null,
      email_same_domain_as_company: null,
      phone_e164: metadata.phoneE164,
      phone_country_code: metadata.phoneCountryCode,
    })
    .eq("id", contact.id);

  if (error) {
    throw new Error(
      `Blad przy update phone contact ${contact.id}: ${error.message}`,
    );
  }
}

async function main() {
  let offset = 0;
  let processedCount = 0;
  let skippedCurrentVersionCount = 0;

  while (true) {
    const { data, error } = await supabase
      .from("company_contacts")
      .select(
        "id, company_id, contact_type, contact_value, normalized_value, validation_version, created_at",
      )
      .order("created_at", { ascending: true })
      .range(offset, offset + READ_BATCH_SIZE - 1);

    if (error) {
      throw new Error(
        `Blad przy pobieraniu company_contacts: ${error.message}`,
      );
    }

    const contacts = (data ?? []) as ContactRow[];

    if (contacts.length === 0) {
      break;
    }

    const staleContacts = contacts.filter(
      (contact) => contact.validation_version !== CONTACT_VALIDATION_VERSION,
    );

    skippedCurrentVersionCount += contacts.length - staleContacts.length;

    const companiesMap = await loadCompaniesMap(
      staleContacts.map((contact) => contact.company_id),
    );

    for (const chunk of chunkArray(staleContacts, UPDATE_CONCURRENCY)) {
      await Promise.all(
        chunk.map((contact) =>
          updateContactValidation(
            contact,
            companiesMap.get(contact.company_id),
          ),
        ),
      );
    }

    processedCount += staleContacts.length;
    offset += READ_BATCH_SIZE;

    console.log(
      `[BATCH] offset=${offset} processedCount=${processedCount} skippedCurrentVersionCount=${skippedCurrentVersionCount}`,
    );
  }

  console.log("Backfill contact validation zakonczony.");
  console.log(`processedCount=${processedCount}`);
  console.log(`skippedCurrentVersionCount=${skippedCurrentVersionCount}`);
}

main().catch((error) => {
  console.error("Skrypt backfillContactValidation nie udal sie:");
  console.error(error);
  process.exit(1);
});
