import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/core/supabaseAdmin";

const PAGE_SIZE = 25;

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
  is_primary: boolean | null;
};

type CompaniesPageProps = {
  searchParams?: Promise<{
    search?: string;
    country?: string;
    status?: string;
    view?: string;
    page?: string;
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getPageNumber(value: string) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function getSafeSearch(value: string) {
  return value.replace(/[,()"'%\\]/g, " ").replace(/\s+/g, " ").trim();
}

// Ta sama normalizacja, którą pipeline zapisuje w kolumnie normalized_name
function getNormalizedSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
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

function getUniqueValues(values: Array<string | null>) {
  return [
    ...new Set(
      values.filter((value): value is string => Boolean(value && value.trim())),
    ),
  ].sort((firstValue, secondValue) => firstValue.localeCompare(secondValue));
}

function buildCompaniesHref(params: {
  view?: string;
  search?: string;
  country?: string;
  status?: string;
  page?: number;
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

  if (params.page && params.page > 1) {
    urlSearchParams.set("page", String(params.page));
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

function buildOutreachExportHref(params: {
  search?: string;
  country?: string;
}) {
  const urlSearchParams = new URLSearchParams();

  if (params.search) {
    urlSearchParams.set("search", params.search);
  }

  if (params.country) {
    urlSearchParams.set("country", params.country);
  }

  const queryString = urlSearchParams.toString();

  return queryString ? `/exportOutreach?${queryString}` : "/exportOutreach";
}

function buildBrevoPrimaryExportHref(params: {
  search?: string;
  country?: string;
}) {
  const urlSearchParams = new URLSearchParams();

  if (params.search) {
    urlSearchParams.set("search", params.search);
  }

  if (params.country) {
    urlSearchParams.set("country", params.country);
  }

  const queryString = urlSearchParams.toString();

  return queryString
    ? `/exportBrevoPrimary?${queryString}`
    : "/exportBrevoPrimary";
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

function getViewClass(isActive: boolean) {
  return isActive ? "btn btn-active" : "btn";
}

function getStatusBadgeClass(status: string | null) {
  if (status === "ready") return "badge badge-ready";
  if (status === "enrich") return "badge badge-enrich";
  if (status === "skip") return "badge badge-skip";
  if (status === "error") return "badge badge-error";
  return "badge";
}

const tableHeaderStyle = {
  textAlign: "left" as const,
  padding: "10px 12px",
  borderBottom: "2px solid #ddd",
  color: "#666",
  fontSize: "13px",
  whiteSpace: "nowrap" as const,
};

const tableCellStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top" as const,
};

export default async function CompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const search = getSingleValue(resolvedSearchParams.search);
  const country = getSingleValue(resolvedSearchParams.country);
  const statusFromUrl = getSingleValue(resolvedSearchParams.status);
  const viewFromUrl = getSingleValue(resolvedSearchParams.view);
  const page = getPageNumber(getSingleValue(resolvedSearchParams.page));

  const activeView = viewFromUrl || "ready";
  const effectiveStatus = getEffectiveStatus({
    view: activeView,
    status: statusFromUrl,
  });

  const safeSearch = getSafeSearch(search);
  const normalizedSearch = getNormalizedSearch(search);

  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let companiesQuery = supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at",
      { count: "exact" },
    );

  if (effectiveStatus) {
    companiesQuery = companiesQuery.eq("status", effectiveStatus);
  }

  if (country) {
    companiesQuery = companiesQuery.eq("country", country);
  }

  if (safeSearch) {
    const searchConditions = [
      `company_name.ilike.%${safeSearch}%`,
      `legal_name.ilike.%${safeSearch}%`,
    ];

    if (normalizedSearch) {
      searchConditions.push(`normalized_name.ilike.%${normalizedSearch}%`);
    }

    companiesQuery = companiesQuery.or(searchConditions.join(","));
  }

  const {
    data: companiesData,
    error: companiesError,
    count: filteredCount,
  } = await companiesQuery
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  const companies = (companiesData ?? []) as CompanyItem[];

  const { data: filterOptionsData, error: filterOptionsError } = await supabase
    .from("companies")
    .select("country, status");

  const filterOptions = (filterOptionsData ?? []) as Array<{
    country: string | null;
    status: string | null;
  }>;

  const availableCountries = getUniqueValues(
    filterOptions.map((row) => row.country),
  );
  const availableStatuses = getUniqueValues(
    filterOptions.map((row) => row.status),
  );

  const companyIds = companies.map((company) => company.id);

  let contacts: ContactItem[] = [];
  let contactsError: { message: string } | null = null;

  if (companyIds.length > 0) {
    const { data: contactsData, error } = await supabase
      .from("company_contacts")
      .select("id, company_id, contact_type, contact_value, is_primary")
      .in("company_id", companyIds)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    contacts = (contactsData ?? []) as ContactItem[];
    contactsError = error;
  }

  const contactMap = groupContactsByCompany(contacts);

  const totalFiltered = filteredCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const isPageOutOfRange =
    Boolean(companiesError) &&
    page > 1 &&
    companiesError?.message.toLowerCase().includes("range");

  const paginationControls = totalPages > 1 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {page > 1 ? (
              <Link
                href={buildCompaniesHref({
                  view: activeView,
                  search,
                  country,
                  status: statusFromUrl,
                  page: page - 1,
                })}
                className="btn"
              >
                Poprzednia
              </Link>
            ) : (
              <span className="btn btn-disabled">
                Poprzednia
              </span>
            )}

            <span>
              Strona {page} z {totalPages}
            </span>

            {page < totalPages ? (
              <Link
                href={buildCompaniesHref({
                  view: activeView,
                  search,
                  country,
                  status: statusFromUrl,
                  page: page + 1,
                })}
                className="btn"
              >
                Następna
              </Link>
            ) : (
              <span className="btn btn-disabled">
                Następna
              </span>
            )}
          </div>
  );

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
        <h1 style={{ margin: 0 }}>Firmy</h1>

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
            className="btn"
          >
            Eksport CSV
          </Link>

          <Link
            href={buildOutreachExportHref({
              search,
              country,
            })}
            className="btn"
          >
            Eksport outreach
          </Link>

          <Link
            href={buildBrevoPrimaryExportHref({
              search,
              country,
            })}
            className="btn"
          >
            Eksport Brevo
          </Link>

          <Link
            href="/reviewQueue"
            className="btn"
          >
            Weryfikacja
          </Link>

          <Link
            href="/enrichQueue"
            className="btn"
          >
            Wzbogacanie
          </Link>

          <Link
            href="/importBatches"
            className="btn"
          >
            Importy
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
        <h2 style={{ marginTop: 0 }}>Widoki</h2>

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
            className={getViewClass(activeView === "ready")}
          >
            Gotowe
          </Link>

          <Link
            href={buildCompaniesHref({
              view: "enrich",
              search,
              country,
            })}
            className={getViewClass(activeView === "enrich")}
          >
            Do wzbogacenia
          </Link>

          <Link
            href={buildCompaniesHref({
              view: "skip",
              search,
              country,
            })}
            className={getViewClass(activeView === "skip")}
          >
            Pominięte
          </Link>

          <Link
            href={buildCompaniesHref({
              view: "all",
              search,
              country,
            })}
            className={getViewClass(activeView === "all")}
          >
            Wszystkie
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
        <h2 style={{ marginTop: 0 }}>Szukaj i filtruj</h2>

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

          <div>
            <label
              htmlFor="status"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Status (ręczny wybór)
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
              <option value="">Automatycznie z widoku</option>
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
              className="btn"
            >
              Filtruj
            </button>

            <Link
              href="/companies"
              className="btn"
            >
              Wyczyść filtry
            </Link>
          </div>
        </form>
      </section>

      {(companiesError || contactsError || filterOptionsError) &&
        !isPageOutOfRange && (
          <section
            style={{
              marginTop: "24px",
              padding: "16px 20px",
              border: "1px solid #e0b4b4",
              borderRadius: "12px",
              background: "#fff6f6",
              color: "#9f3a38",
            }}
          >
            <strong>Wystąpił błąd podczas pobierania danych:</strong>
            {companiesError && (
              <p style={{ margin: "6px 0 0" }}>{companiesError.message}</p>
            )}
            {contactsError && (
              <p style={{ margin: "6px 0 0" }}>{contactsError.message}</p>
            )}
            {filterOptionsError && (
              <p style={{ margin: "6px 0 0" }}>{filterOptionsError.message}</p>
            )}
          </section>
        )}

      <section
        style={{
          marginTop: "24px",
          display: "flex",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          color: "#666",
        }}
      >
        <p style={{ margin: 0 }}>
          Wyniki: {totalFiltered} firm
          {totalFiltered > 0 &&
            ` · pozycje ${rangeFrom + 1}–${Math.min(
              rangeFrom + PAGE_SIZE,
              totalFiltered,
            )}`}
        </p>

        {paginationControls}
      </section>

      <section style={{ marginTop: "16px" }}>
        {isPageOutOfRange ? (
          <div>
            <p>Ta strona nie istnieje dla bieżących filtrów.</p>
            <Link
              href={buildCompaniesHref({
                view: activeView,
                search,
                country,
                status: statusFromUrl,
              })}
              className="btn"
            >
              Wróć na pierwszą stronę
            </Link>
          </div>
        ) : companies.length === 0 ? (
          <p>Brak firm pasujących do filtrów.</p>
        ) : (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              background: "#fff",
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Nazwa</th>
                  <th style={tableHeaderStyle}>Miasto</th>
                  <th style={tableHeaderStyle}>Kraj</th>
                  <th style={tableHeaderStyle}>Kategoria</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Jakość</th>
                  <th style={tableHeaderStyle}>E-mail</th>
                  <th style={tableHeaderStyle}>Telefon</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const companyContacts = contactMap.get(company.id) ?? [];
                  const primaryEmail = getPrimaryContact(
                    companyContacts,
                    "email",
                  );
                  const primaryPhone = getPrimaryContact(
                    companyContacts,
                    "phone",
                  );

                  return (
                    <tr key={company.id}>
                      <td style={tableCellStyle}>
                        <Link
                          href={`/companies/${company.id}`}
                          style={{
                            color: "inherit",
                            fontWeight: 700,
                          }}
                        >
                          {company.company_name ?? "brak nazwy"}
                        </Link>
                        {company.website && (
                          <div style={{ marginTop: "4px" }}>
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#666", fontSize: "13px" }}
                            >
                              {company.domain ?? company.website}
                            </a>
                          </div>
                        )}
                      </td>
                      <td style={tableCellStyle}>{company.city ?? "—"}</td>
                      <td style={tableCellStyle}>{company.country ?? "—"}</td>
                      <td style={tableCellStyle}>{company.category ?? "—"}</td>
                      <td style={tableCellStyle}>
                        <span className={getStatusBadgeClass(company.status)}>
                          {company.status ?? "brak"}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        {company.quality_score ?? "—"}
                      </td>
                      <td style={tableCellStyle}>{primaryEmail ?? "—"}</td>
                      <td style={tableCellStyle}>{primaryPhone ?? "—"}</td>
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
        {paginationControls}
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
