import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/core/supabaseAdmin";

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
  return fallback?.contact_value ?? null;
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
    <main style={{ padding: "40px" }}>
      <div
        style={{
          display: "flex",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Kolejka wzbogacania</h1>

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
            className="btn"
          >
            Eksport CSV
          </a>

          <Link
            href="/companies?view=enrich"
            className="btn"
          >
            Wróć do firm
          </Link>
        </div>
      </div>

      <section
        className="card"
        style={{ marginTop: "24px" }}
      >
        <h2 style={{ marginTop: 0 }}>Filtry</h2>

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
              Szukaj
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
              Kraj
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
              className="btn"
            >
              Filtruj
            </button>

            <Link
              href="/enrichQueue"
              className="btn"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      {(companiesError || contactsError) && (
        <section className="error-box">
          <strong>Wystąpił błąd podczas pobierania danych:</strong>
          {companiesError && (
            <p style={{ margin: "6px 0 0" }}>{companiesError.message}</p>
          )}
          {contactsError && (
            <p style={{ margin: "6px 0 0" }}>{contactsError.message}</p>
          )}
        </section>
      )}

      <section
        className="muted"
        style={{ marginTop: "24px" }}
      >
        <p style={{ margin: 0 }}>
          Wyniki: {filteredCompanies.length} z {enrichCompanies.length} firm
          {" · "}brak e-maila: {needEmailCount}
          {" · "}brak telefonu: {needPhoneCount}
        </p>
      </section>

      <section style={{ marginTop: "16px" }}>
        {filteredCompanies.length === 0 ? (
          <p>Brak firm w kolejce wzbogacania.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Miasto</th>
                  <th>Kraj</th>
                  <th>Kategoria</th>
                  <th>Telefon</th>
                  <th>E-mail</th>
                  <th>Do znalezienia</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => {
                  const contacts = contactMap.get(company.id) ?? [];
                  const phoneCount = contacts.filter(
                    (contact) => contact.contact_type === "phone",
                  ).length;
                  const emailCount = contacts.filter(
                    (contact) => contact.contact_type === "email",
                  ).length;
                  const primaryPhone = getPrimaryContact(contacts, "phone");
                  const primaryEmail = getPrimaryContact(contacts, "email");

                  return (
                    <tr key={company.id}>
                      <td>
                        <Link
                          href={`/companies/${company.id}`}
                          style={{ color: "inherit", fontWeight: 700 }}
                        >
                          {company.company_name ?? "brak nazwy"}
                        </Link>
                        {company.website && (
                          <div style={{ marginTop: "4px" }}>
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              className="muted"
                              style={{ fontSize: "13px" }}
                            >
                              {company.domain ?? company.website}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>{company.city ?? "—"}</td>
                      <td>{company.country ?? "—"}</td>
                      <td>{company.category ?? "—"}</td>
                      <td>
                        {primaryPhone ?? "—"}
                        {phoneCount > 1 && (
                          <span className="muted"> (+{phoneCount - 1})</span>
                        )}
                      </td>
                      <td>
                        {primaryEmail ?? "—"}
                        {emailCount > 1 && (
                          <span className="muted"> (+{emailCount - 1})</span>
                        )}
                      </td>
                      <td>
                        {emailCount === 0 && (
                          <span
                            className="badge badge-enrich"
                            style={{ marginRight: "6px" }}
                          >
                            e-mail
                          </span>
                        )}
                        {phoneCount === 0 && (
                          <span className="badge badge-enrich">telefon</span>
                        )}
                        {emailCount > 0 && phoneCount > 0 && "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: "24px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/companies?view=enrich"
          className="btn"
        >
          Wróć do firm
        </Link>
        <a
          href="#"
          className="btn"
          style={{ marginLeft: "auto" }}
        >
          Do góry
        </a>
      </section>
    </main>
  );
}
