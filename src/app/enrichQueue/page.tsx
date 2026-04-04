import Link from "next/link";
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

type EnrichQueuePageProps = {
  searchParams?: Promise<{
    search?: string;
    country?: string;
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

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

function getUniqueValues(values: Array<string | null>) {
  return [
    ...new Set(
      values.filter((value): value is string => Boolean(value && value.trim())),
    ),
  ].sort((firstValue, secondValue) => firstValue.localeCompare(secondValue));
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
  return fallback?.contact_value ?? "brak";
}

function getAllContacts(
  contacts: ContactItem[],
  contactType: "phone" | "email",
) {
  const values = contacts
    .filter((contact) => contact.contact_type === contactType)
    .map((contact) => contact.contact_value);

  if (values.length === 0) return "brak";

  return values.join(" | ");
}

function getEnrichAction(contacts: ContactItem[]) {
  const emailExists = hasEmail(contacts);
  const phoneExists = hasPhone(contacts);

  if (phoneExists && !emailExists) return "findEmail";
  if (!phoneExists && emailExists) return "findPhone";
  if (!phoneExists && !emailExists) return "findEmailAndPhone";
  return "none";
}

function buildExportEnrichHref(params: { search?: string; country?: string }) {
  const urlSearchParams = new URLSearchParams();

  if (params.search) {
    urlSearchParams.set("search", params.search);
  }

  if (params.country) {
    urlSearchParams.set("country", params.country);
  }

  const queryString = urlSearchParams.toString();

  return queryString ? `/exportEnrich?${queryString}` : "/exportEnrich";
}

export default async function EnrichQueuePage({
  searchParams,
}: EnrichQueuePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const search = getSingleValue(resolvedSearchParams.search);
  const country = getSingleValue(resolvedSearchParams.country);

  const normalizedSearch = normalizeSearchValue(search);

  const { data: companiesData, error: companiesError } = await supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at",
    )
    .eq("status", "enrich")
    .order("created_at", { ascending: false });

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select(
      "id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at",
    )
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  const enrichCompanies = (companiesData ?? []) as CompanyItem[];
  const allContacts = (contactsData ?? []) as ContactItem[];
  const contactMap = groupContactsByCompany(allContacts);

  const availableCountries = getUniqueValues(
    enrichCompanies.map((company) => company.country),
  );

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

  const needEmailCount = filteredCompanies.filter((company) => {
    const contacts = contactMap.get(company.id) ?? [];
    return !hasEmail(contacts);
  }).length;

  const needPhoneCount = filteredCompanies.filter((company) => {
    const contacts = contactMap.get(company.id) ?? [];
    return !hasPhone(contacts);
  }).length;

  return (
    <main style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
      <div
        style={{
          display: "flex",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>EnrichQueue</h1>

        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href={buildExportEnrichHref({
              search,
              country,
            })}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "inherit",
              display: "inline-block",
            }}
          >
            ExportEnrichCsv
          </a>

          <Link
            href="/companies?view=enrich"
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "inherit",
              display: "inline-block",
            }}
          >
            Wróć do companies
          </Link>
        </div>
      </div>

      <section
        style={{
          marginTop: "24px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>EnrichFilters</h2>

        <form
          method="get"
          style={{
            display: "grid",
            gap: "16px",
            marginTop: "16px",
          }}
        >
          <div>
            <label
              htmlFor="search"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Search
            </label>
            <input
              id="search"
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Wpisz nazwę firmy"
              style={{
                width: "100%",
                maxWidth: "420px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="country"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Country
            </label>
            <select
              id="country"
              name="country"
              defaultValue={country}
              style={{
                width: "100%",
                maxWidth: "260px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #ccc",
              }}
            >
              <option value="">Wszystkie</option>
              {availableCountries.map((countryValue) => (
                <option
                  key={countryValue}
                  value={countryValue}
                >
                  {countryValue}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                cursor: "pointer",
                background: "#fff",
              }}
            >
              Filtruj
            </button>

            <Link
              href="/enrichQueue"
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                textDecoration: "none",
                color: "inherit",
                display: "inline-block",
              }}
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section style={{ marginTop: "24px" }}>
        <p>Liczba firm enrich: {enrichCompanies.length}</p>
        <p>Liczba wyników po filtrowaniu: {filteredCompanies.length}</p>
        <p>needEmailCount: {needEmailCount}</p>
        <p>needPhoneCount: {needPhoneCount}</p>
        <p>
          companies error: {companiesError ? companiesError.message : "brak"}
        </p>
        <p>contacts error: {contactsError ? contactsError.message : "brak"}</p>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>Aktywne filtry</h2>
        <p>search: {search || "brak"}</p>
        <p>country: {country || "brak"}</p>
      </section>

      <section style={{ marginTop: "32px" }}>
        {filteredCompanies.length === 0 ? (
          <p>Brak firm w enrichQueue.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {filteredCompanies.map((company) => {
              const contacts = contactMap.get(company.id) ?? [];
              const emailExists = hasEmail(contacts);
              const phoneExists = hasPhone(contacts);
              const enrichAction = getEnrichAction(contacts);

              return (
                <article
                  key={company.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    padding: "20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <h2 style={{ margin: 0 }}>
                      {company.company_name ?? "brak nazwy"}
                    </h2>

                    <Link
                      href={`/companies/${company.id}`}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        textDecoration: "none",
                        color: "inherit",
                        display: "inline-block",
                      }}
                    >
                      Zobacz szczegóły
                    </Link>
                  </div>

                  <div style={{ marginTop: "12px" }}>
                    <p>
                      <strong>legalName:</strong> {company.legal_name ?? "brak"}
                    </p>
                    <p>
                      <strong>domain:</strong> {company.domain ?? "brak"}
                    </p>
                    <p>
                      <strong>website:</strong> {company.website ?? "brak"}
                    </p>
                    <p>
                      <strong>city:</strong> {company.city ?? "brak"}
                    </p>
                    <p>
                      <strong>country:</strong> {company.country ?? "brak"}
                    </p>
                    <p>
                      <strong>category:</strong> {company.category ?? "brak"}
                    </p>
                    <p>
                      <strong>status:</strong> {company.status ?? "brak"}
                    </p>
                    <p>
                      <strong>qualityScore:</strong>{" "}
                      {company.quality_score ?? "brak"}
                    </p>
                    <p>
                      <strong>hasPhone:</strong> {phoneExists ? "yes" : "no"}
                    </p>
                    <p>
                      <strong>hasEmail:</strong> {emailExists ? "yes" : "no"}
                    </p>
                    <p>
                      <strong>enrichAction:</strong> {enrichAction}
                    </p>
                    <p>
                      <strong>primaryPhone:</strong>{" "}
                      {getPrimaryContact(contacts, "phone")}
                    </p>
                    <p>
                      <strong>primaryEmail:</strong>{" "}
                      {getPrimaryContact(contacts, "email")}
                    </p>
                    <p>
                      <strong>allPhones:</strong>{" "}
                      {getAllContacts(contacts, "phone")}
                    </p>
                    <p>
                      <strong>allEmails:</strong>{" "}
                      {getAllContacts(contacts, "email")}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
