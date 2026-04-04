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

type CompaniesPageProps = {
  searchParams?: Promise<{
    search?: string;
    country?: string;
    status?: string;
    view?: string;
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

function getStatusLabel(status: string | null) {
  if (!status) return "brak";
  return status;
}

function getQualityLabel(score: number | null) {
  if (score === null || score === undefined) return "brak";
  return String(score);
}

function buildCompaniesHref(params: {
  view?: string;
  search?: string;
  country?: string;
  status?: string;
}) {
  const urlSearchParams = new URLSearchParams();

  if (params.view) {
    urlSearchParams.set("view", params.view);
  }

  if (params.search) {
    urlSearchParams.set("search", params.search);
  }

  if (params.country) {
    urlSearchParams.set("country", params.country);
  }

  if (params.status) {
    urlSearchParams.set("status", params.status);
  }

  const queryString = urlSearchParams.toString();

  return queryString ? `/companies?${queryString}` : "/companies";
}

function buildExportHref(params: {
  view?: string;
  search?: string;
  country?: string;
  status?: string;
}) {
  const urlSearchParams = new URLSearchParams();

  if (params.view) {
    urlSearchParams.set("view", params.view);
  }

  if (params.search) {
    urlSearchParams.set("search", params.search);
  }

  if (params.country) {
    urlSearchParams.set("country", params.country);
  }

  if (params.status) {
    urlSearchParams.set("status", params.status);
  }

  const queryString = urlSearchParams.toString();

  return queryString ? `/exportCompanies?${queryString}` : "/exportCompanies";
}

function getEffectiveStatus(params: { view: string; status: string }) {
  if (params.status) {
    return params.status;
  }

  if (params.view === "all") {
    return "";
  }

  if (params.view === "enrich") {
    return "enrich";
  }

  if (params.view === "skip") {
    return "skip";
  }

  return "ready";
}

function getViewLabel(view: string) {
  if (view === "all") return "all";
  if (view === "enrich") return "enrich";
  if (view === "skip") return "skip";
  return "ready";
}

function getViewCardStyle(isActive: boolean) {
  return {
    padding: "12px 16px",
    borderRadius: "10px",
    border: isActive ? "2px solid #111" : "1px solid #ccc",
    textDecoration: "none",
    color: "inherit",
    display: "inline-block",
    fontWeight: isActive ? 700 : 400,
  } as const;
}

export default async function CompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const search = getSingleValue(resolvedSearchParams.search);
  const country = getSingleValue(resolvedSearchParams.country);
  const statusFromUrl = getSingleValue(resolvedSearchParams.status);
  const viewFromUrl = getSingleValue(resolvedSearchParams.view);

  const activeView = viewFromUrl || "ready";
  const effectiveStatus = getEffectiveStatus({
    view: activeView,
    status: statusFromUrl,
  });

  const normalizedSearch = normalizeSearchValue(search);

  const { data: companiesData, error: companiesError } = await supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at",
    )
    .order("created_at", { ascending: false });

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select(
      "id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at",
    )
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  const allCompanies = (companiesData ?? []) as CompanyItem[];
  const allContacts = (contactsData ?? []) as ContactItem[];

  const availableCountries = getUniqueValues(
    allCompanies.map((company) => company.country),
  );
  const availableStatuses = getUniqueValues(
    allCompanies.map((company) => company.status),
  );

  const filteredCompanies = allCompanies.filter((company) => {
    const normalizedCompanyName = normalizeSearchValue(company.company_name);
    const normalizedLegalName = normalizeSearchValue(company.legal_name);

    const matchesSearch =
      !normalizedSearch ||
      normalizedCompanyName.includes(normalizedSearch) ||
      normalizedLegalName.includes(normalizedSearch);

    const matchesCountry = !country || company.country === country;
    const matchesStatus =
      !effectiveStatus || company.status === effectiveStatus;

    return matchesSearch && matchesCountry && matchesStatus;
  });

  const contactMap = groupContactsByCompany(allContacts);

  const filteredContactsCount = filteredCompanies.reduce((count, company) => {
    const companyContacts = contactMap.get(company.id) ?? [];
    return count + companyContacts.length;
  }, 0);

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
        <h1 style={{ margin: 0 }}>Companies</h1>

        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href={buildExportHref({
              view: activeView,
              search,
              country,
              status: statusFromUrl,
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
            ExportCsv
          </Link>

          <Link
            href="/reviewQueue"
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "inherit",
              display: "inline-block",
            }}
          >
            ReviewQueue
          </Link>

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
            DocelowaQueue
          </Link>
          <Link
            href="/importBatches"
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "inherit",
              display: "inline-block",
            }}
          >
            ImportBatches
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
        <h2 style={{ marginTop: 0 }}>LeadQueues</h2>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "16px",
          }}
        >
          <Link
            href={buildCompaniesHref({
              view: "ready",
              search,
              country,
            })}
            style={getViewCardStyle(activeView === "ready")}
          >
            Ready
          </Link>

          <Link
            href={buildCompaniesHref({
              view: "enrich",
              search,
              country,
            })}
            style={getViewCardStyle(activeView === "enrich")}
          >
            Enrich
          </Link>

          <Link
            href={buildCompaniesHref({
              view: "skip",
              search,
              country,
            })}
            style={getViewCardStyle(activeView === "skip")}
          >
            Skip
          </Link>

          <Link
            href={buildCompaniesHref({
              view: "all",
              search,
              country,
            })}
            style={getViewCardStyle(activeView === "all")}
          >
            All
          </Link>
        </div>
      </section>

      <section
        style={{
          marginTop: "24px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>SearchAndFilters</h2>

        <form
          method="get"
          style={{
            display: "grid",
            gap: "16px",
            marginTop: "16px",
          }}
        >
          <input
            type="hidden"
            name="view"
            value={activeView}
          />

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

          <div>
            <label
              htmlFor="status"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Status override
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFromUrl}
              style={{
                width: "100%",
                maxWidth: "260px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #ccc",
              }}
            >
              <option value="">Automatycznie z view</option>
              {availableStatuses.map((statusValue) => (
                <option
                  key={statusValue}
                  value={statusValue}
                >
                  {statusValue}
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
              href="/companies"
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                textDecoration: "none",
                color: "inherit",
                display: "inline-block",
              }}
            >
              Reset do ready
            </Link>
          </div>
        </form>
      </section>

      <section style={{ marginTop: "24px" }}>
        <p>Liczba wszystkich firm: {allCompanies.length}</p>
        <p>Liczba wyników po filtrowaniu: {filteredCompanies.length}</p>
        <p>Liczba kontaktów w widocznych wynikach: {filteredContactsCount}</p>
        <p>
          companies error: {companiesError ? companiesError.message : "brak"}
        </p>
        <p>contacts error: {contactsError ? contactsError.message : "brak"}</p>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>Aktywny widok</h2>
        <p>view: {getViewLabel(activeView)}</p>
        <p>effectiveStatus: {effectiveStatus || "brak"}</p>
        <p>search: {search || "brak"}</p>
        <p>country: {country || "brak"}</p>
        <p>status override: {statusFromUrl || "brak"}</p>
      </section>

      <section style={{ marginTop: "32px" }}>
        {filteredCompanies.length === 0 ? (
          <p>Brak firm pasujących do filtrów.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {filteredCompanies.map((company) => {
              const companyContacts = contactMap.get(company.id) ?? [];

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
                      <strong>status:</strong> {getStatusLabel(company.status)}
                    </p>
                    <p>
                      <strong>qualityScore:</strong>{" "}
                      {getQualityLabel(company.quality_score)}
                    </p>
                  </div>

                  <div style={{ marginTop: "18px" }}>
                    <h3 style={{ marginBottom: "10px" }}>Kontakty</h3>

                    {companyContacts.length === 0 ? (
                      <p>Brak kontaktów.</p>
                    ) : (
                      <ul style={{ paddingLeft: "20px" }}>
                        {companyContacts.map((contact) => (
                          <li
                            key={contact.id}
                            style={{ marginBottom: "8px" }}
                          >
                            <strong>{contact.contact_type}</strong>:{" "}
                            {contact.contact_value}
                            {contact.is_primary ? " | primary" : ""}
                            {contact.is_verified ? " | verified" : ""}
                            {contact.source
                              ? ` | source: ${contact.source}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
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
