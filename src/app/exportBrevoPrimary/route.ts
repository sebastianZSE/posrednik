import { supabase } from "@/lib/supabase";

type CompanyItem = {
  id: string;
  company_name: string | null;
  legal_name: string | null;
  domain: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  status: string | null;
  quality_score: number | null;
  created_at: string | null;
};

type ContactItem = {
  id: string;
  company_id: string;
  contact_type: "phone" | "email";
  contact_value: string;
  normalized_value: string | null;
  is_primary: boolean | null;
  is_verified: boolean | null;
  source: string | null;
  created_at: string | null;
  validation_status: string | null;
  email_same_domain_as_company: boolean | null;
  email_kind: string | null;
  phone_e164: string | null;
  phone_country_code: string | null;
};

const BLOCKED_EMAIL_LOCAL_PARTS = new Set([
  "datenschutz",
  "privacy",
  "legal",
  "jobs",
  "job",
  "karriere",
  "career",
  "bewerbung",
]);

function getSingleValue(value: string | null) {
  return value ?? "";
}

function normalizeSearchValue(value: string | null | undefined) {
  if (!value) return "";

  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function groupContactsByCompany(contacts: ContactItem[]) {
  const contactMap = new Map<string, ContactItem[]>();

  for (const contact of contacts) {
    const currentList = contactMap.get(contact.company_id) ?? [];
    currentList.push(contact);
    contactMap.set(contact.company_id, currentList);
  }

  return contactMap;
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  const escapedValue = stringValue.replace(/"/g, '""');
  return `"${escapedValue}"`;
}

function buildCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function buildFileName(params: {
  country: string;
  search: string;
}) {
  const safeCountry = params.country || "all";
  const safeSearch = params.search
    ? params.search.replace(/[^\p{L}\p{N}]+/gu, "_")
    : "all";

  return `brevo_primary_${safeCountry}_${safeSearch}.csv`;
}

function normalizeEmailForExport(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/^mailto:/i, "");
}

function hasExactlyOneAtSign(value: string) {
  return (value.match(/@/g) ?? []).length === 1;
}

function isOutreachSafeEmail(contact: ContactItem) {
  if (contact.contact_type !== "email") return false;
  if (contact.validation_status !== "validLike") return false;
  if (contact.email_same_domain_as_company !== true) return false;

  const email = normalizeEmailForExport(contact.contact_value);

  if (!email) return false;
  if (!hasExactlyOneAtSign(email)) return false;
  if (email.includes(" ")) return false;
  if (email.includes("%20")) return false;
  if (email.includes("www")) return false;
  if (email.includes("|")) return false;
  if (email.includes("http://")) return false;
  if (email.includes("https://")) return false;

  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(email)) {
    return false;
  }

  const [localPart = ""] = email.split("@");

  if (!localPart) return false;
  if (BLOCKED_EMAIL_LOCAL_PARTS.has(localPart)) return false;
  if (/^\d{4,}/.test(localPart)) return false;

  return true;
}

function normalizePhoneForExport(contact: ContactItem) {
  return (
    contact.phone_e164 ??
    contact.normalized_value ??
    contact.contact_value ??
    ""
  ).trim();
}

function isOutreachSafePhone(contact: ContactItem) {
  if (contact.contact_type !== "phone") return false;
  if (!["validLike", "risky"].includes(contact.validation_status ?? "")) {
    return false;
  }

  const phone = normalizePhoneForExport(contact);

  if (!phone) return false;
  if (!phone.startsWith("+")) return false;

  const digits = phone.replace(/\D/g, "");

  if (digits.length < 10) return false;
  if (digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  return true;
}

function getEmailKindRank(emailKind: string | null) {
  if (emailKind === "generic") return 0;
  if (emailKind === "unknown") return 1;
  if (emailKind === "personal") return 2;
  return 3;
}

function getBestSafeEmailContact(contacts: ContactItem[]) {
  const safeEmails = contacts.filter(isOutreachSafeEmail);

  if (safeEmails.length === 0) {
    return null;
  }

  const sorted = [...safeEmails].sort((firstContact, secondContact) => {
    const primaryDiff =
      Number(Boolean(secondContact.is_primary)) -
      Number(Boolean(firstContact.is_primary));

    if (primaryDiff !== 0) return primaryDiff;

    const emailKindDiff =
      getEmailKindRank(firstContact.email_kind) -
      getEmailKindRank(secondContact.email_kind);

    if (emailKindDiff !== 0) return emailKindDiff;

    const createdAtFirst = firstContact.created_at ?? "";
    const createdAtSecond = secondContact.created_at ?? "";

    return createdAtFirst.localeCompare(createdAtSecond);
  });

  return sorted[0] ?? null;
}

function getBestSafePhoneContact(contacts: ContactItem[]) {
  const safePhones = contacts.filter(isOutreachSafePhone);

  if (safePhones.length === 0) {
    return null;
  }

  const sorted = [...safePhones].sort((firstContact, secondContact) => {
    const primaryDiff =
      Number(Boolean(secondContact.is_primary)) -
      Number(Boolean(firstContact.is_primary));

    if (primaryDiff !== 0) return primaryDiff;

    const firstIsValidLike =
      firstContact.validation_status === "validLike" ? 0 : 1;
    const secondIsValidLike =
      secondContact.validation_status === "validLike" ? 0 : 1;

    if (firstIsValidLike !== secondIsValidLike) {
      return firstIsValidLike - secondIsValidLike;
    }

    const createdAtFirst = firstContact.created_at ?? "";
    const createdAtSecond = secondContact.created_at ?? "";

    return createdAtFirst.localeCompare(createdAtSecond);
  });

  return sorted[0] ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = getSingleValue(searchParams.get("search"));
  const country = getSingleValue(searchParams.get("country"));
  const normalizedSearch = normalizeSearchValue(search);

  let companiesQuery = supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at",
    )
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (country) {
    companiesQuery = companiesQuery.eq("country", country);
  }

  const { data: companiesData, error: companiesError } = await companiesQuery;

  if (companiesError) {
    return new Response(`Blad companies: ${companiesError.message}`, {
      status: 500,
    });
  }

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select(
      "id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at, validation_status, email_same_domain_as_company, email_kind, phone_e164, phone_country_code",
    )
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (contactsError) {
    return new Response(`Blad contacts: ${contactsError.message}`, {
      status: 500,
    });
  }

  const allCompanies = (companiesData ?? []) as CompanyItem[];
  const allContacts = (contactsData ?? []) as ContactItem[];
  const contactMap = groupContactsByCompany(allContacts);

  const filteredCompanies = allCompanies.filter((company) => {
    const normalizedCompanyName = normalizeSearchValue(company.company_name);
    const normalizedLegalName = normalizeSearchValue(company.legal_name);

    const matchesSearch =
      !normalizedSearch ||
      normalizedCompanyName.includes(normalizedSearch) ||
      normalizedLegalName.includes(normalizedSearch);

    if (!matchesSearch) {
      return false;
    }

    const companyContacts = contactMap.get(company.id) ?? [];
    const bestEmail = getBestSafeEmailContact(companyContacts);

    return Boolean(bestEmail);
  });

  const csvRows: string[][] = [
    [
      "email",
      "companyName",
      "legalName",
      "domain",
      "website",
      "city",
      "country",
      "category",
      "primaryPhone",
      "companyId",
      "qualityScore",
      "emailKind",
      "isPrimaryEmail",
      "createdAt",
    ],
  ];

  for (const company of filteredCompanies) {
    const companyContacts = contactMap.get(company.id) ?? [];
    const bestEmail = getBestSafeEmailContact(companyContacts);

    if (!bestEmail) {
      continue;
    }

    const bestPhone = getBestSafePhoneContact(companyContacts);

    csvRows.push([
      normalizeEmailForExport(bestEmail.contact_value),
      company.company_name ?? "",
      company.legal_name ?? "",
      company.domain ?? "",
      company.website ?? "",
      company.city ?? "",
      company.country ?? "",
      company.category ?? "",
      bestPhone ? normalizePhoneForExport(bestPhone) : "",
      company.id,
      String(company.quality_score ?? ""),
      bestEmail.email_kind ?? "",
      String(Boolean(bestEmail.is_primary)),
      company.created_at ?? "",
    ]);
  }

  const csvContent = buildCsv(csvRows);
  const fileName = buildFileName({
    country,
    search,
  });

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}