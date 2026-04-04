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
};

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

function hasEmail(contacts: ContactItem[]) {
  return contacts.some((contact) => contact.contact_type === "email");
}

function hasPhone(contacts: ContactItem[]) {
  return contacts.some((contact) => contact.contact_type === "phone");
}

function getPrimaryContact(
  contacts: ContactItem[],
  contactType: "phone" | "email",
) {
  const primary = contacts.find(
    (contact) => contact.contact_type === contactType && contact.is_primary,
  );

  if (primary) return primary.contact_value;

  const fallback = contacts.find(
    (contact) => contact.contact_type === contactType,
  );
  return fallback?.contact_value ?? "";
}

function getAllContacts(
  contacts: ContactItem[],
  contactType: "phone" | "email",
) {
  return contacts
    .filter((contact) => contact.contact_type === contactType)
    .map((contact) => contact.contact_value)
    .join(" | ");
}

function getEnrichAction(contacts: ContactItem[]) {
  const emailExists = hasEmail(contacts);
  const phoneExists = hasPhone(contacts);

  if (phoneExists && !emailExists) return "findEmail";
  if (!phoneExists && emailExists) return "findPhone";
  if (!phoneExists && !emailExists) return "findEmailAndPhone";
  return "none";
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  const escapedValue = stringValue.replace(/"/g, '""');
  return `"${escapedValue}"`;
}

function buildCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function buildFileName(params: { country: string; search: string }) {
  const safeCountry = params.country || "all";
  const safeSearch = params.search
    ? params.search.replace(/[^\p{L}\p{N}]+/gu, "_")
    : "all";

  return `enrichQueue_${safeCountry}_${safeSearch}.csv`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = getSingleValue(searchParams.get("search"));
  const country = getSingleValue(searchParams.get("country"));

  const normalizedSearch = normalizeSearchValue(search);

  const { data: companiesData, error: companiesError } = await supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at",
    )
    .eq("status", "enrich")
    .order("created_at", { ascending: false });

  if (companiesError) {
    return new Response(`Blad companies: ${companiesError.message}`, {
      status: 500,
    });
  }

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select(
      "id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at",
    )
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (contactsError) {
    return new Response(`Blad contacts: ${contactsError.message}`, {
      status: 500,
    });
  }

  const enrichCompanies = (companiesData ?? []) as CompanyItem[];
  const allContacts = (contactsData ?? []) as ContactItem[];
  const contactMap = groupContactsByCompany(allContacts);

  const filteredCompanies = enrichCompanies.filter((company) => {
    const normalizedCompanyName = normalizeSearchValue(company.company_name);
    const normalizedLegalName = normalizeSearchValue(company.legal_name);

    const matchesSearch =
      !normalizedSearch ||
      normalizedCompanyName.includes(normalizedSearch) ||
      normalizedLegalName.includes(normalizedSearch);

    const matchesCountry = !country || company.country === country;

    return matchesSearch && matchesCountry;
  });

  const csvRows: string[][] = [
    [
      "companyId",
      "companyName",
      "legalName",
      "domain",
      "website",
      "city",
      "country",
      "category",
      "status",
      "qualityScore",
      "hasPhone",
      "hasEmail",
      "needsPhone",
      "needsEmail",
      "enrichAction",
      "primaryPhone",
      "allPhones",
      "primaryEmail",
      "allEmails",
      "contactsCount",
      "createdAt",
    ],
  ];

  for (const company of filteredCompanies) {
    const contacts = contactMap.get(company.id) ?? [];

    const emailExists = hasEmail(contacts);
    const phoneExists = hasPhone(contacts);

    const primaryPhone = getPrimaryContact(contacts, "phone");
    const allPhones = getAllContacts(contacts, "phone");
    const primaryEmail = getPrimaryContact(contacts, "email");
    const allEmails = getAllContacts(contacts, "email");

    csvRows.push([
      company.id,
      company.company_name ?? "",
      company.legal_name ?? "",
      company.domain ?? "",
      company.website ?? "",
      company.city ?? "",
      company.country ?? "",
      company.category ?? "",
      company.status ?? "",
      String(company.quality_score ?? ""),
      phoneExists ? "yes" : "no",
      emailExists ? "yes" : "no",
      phoneExists ? "no" : "yes",
      emailExists ? "no" : "yes",
      getEnrichAction(contacts),
      primaryPhone,
      allPhones,
      primaryEmail,
      allEmails,
      String(contacts.length),
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
