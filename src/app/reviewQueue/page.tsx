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

type ImportErrorItem = {
  id: string;
  company_name: string | null;
  source: string | null;
  promotion_status: string | null;
  promotion_error: string | null;
  imported_at: string | null;
};

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

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pl-PL");
}

function getStatusBadgeClass(status: string | null) {
  if (status === "ready") return "badge badge-ready";
  if (status === "enrich") return "badge badge-enrich";
  if (status === "skip") return "badge badge-skip";
  if (status === "error") return "badge badge-error";
  return "badge";
}

function CompaniesTable({
  companies,
  contactMap,
}: {
  companies: CompanyItem[];
  contactMap: Map<string, ContactItem[]>;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th>Miasto</th>
            <th>Kraj</th>
            <th>Kategoria</th>
            <th>Status</th>
            <th>Jakość</th>
            <th>Kontakty</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const contacts = contactMap.get(company.id) ?? [];

            return (
              <tr key={company.id}>
                <td>
                  <Link
                    href={`/companies/${company.id}`}
                    style={{ color: "inherit", fontWeight: 700 }}
                  >
                    {company.company_name ?? "brak nazwy"}
                  </Link>
                </td>
                <td>{company.city ?? "—"}</td>
                <td>{company.country ?? "—"}</td>
                <td>{company.category ?? "—"}</td>
                <td>
                  <span className={getStatusBadgeClass(company.status)}>
                    {company.status ?? "brak"}
                  </span>
                </td>
                <td>{company.quality_score ?? "—"}</td>
                <td>{contacts.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const statCardStyle = {
  border: "1px solid #ddd",
  borderRadius: "12px",
  padding: "16px 20px",
  background: "#fff",
} as const;

const statValueStyle = {
  fontSize: "26px",
  fontWeight: 700,
  margin: "4px 0 0",
} as const;

const statLabelStyle = {
  margin: 0,
  color: "#666",
  fontSize: "14px",
} as const;

export default async function ReviewQueuePage() {
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
    .order("created_at", { ascending: false });

  const { data: importErrorsData, error: importErrorsError } = await supabase
    .from("imports_raw")
    .select(
      "id, company_name, source, promotion_status, promotion_error, imported_at",
    )
    .eq("promotion_status", "error")
    .order("imported_at", { ascending: false });

  const companies = (companiesData ?? []) as CompanyItem[];
  const contacts = (contactsData ?? []) as ContactItem[];
  const importErrors = (importErrorsData ?? []) as ImportErrorItem[];

  const contactMap = groupContactsByCompany(contacts);

  const missingEmailCompanies = companies.filter((company) => {
    const companyContacts = contactMap.get(company.id) ?? [];
    return !hasEmail(companyContacts);
  });

  const missingPhoneCompanies = companies.filter((company) => {
    const companyContacts = contactMap.get(company.id) ?? [];
    return !hasPhone(companyContacts);
  });

  const lowQualityCompanies = companies.filter((company) => {
    const score = company.quality_score ?? 0;
    return score < 6;
  });

  const notReadyCompanies = companies.filter((company) => {
    return company.status !== "ready";
  });

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
        <h1 style={{ margin: 0 }}>Kolejka weryfikacji</h1>

        <Link
          href="/companies"
          className="btn"
        >
          Wróć do firm
        </Link>
      </div>

      {(companiesError || contactsError || importErrorsError) && (
        <section className="error-box">
          <strong>Wystąpił błąd podczas pobierania danych:</strong>
          {companiesError && (
            <p style={{ margin: "6px 0 0" }}>{companiesError.message}</p>
          )}
          {contactsError && (
            <p style={{ margin: "6px 0 0" }}>{contactsError.message}</p>
          )}
          {importErrorsError && (
            <p style={{ margin: "6px 0 0" }}>{importErrorsError.message}</p>
          )}
        </section>
      )}

      <section
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        <div style={statCardStyle}>
          <p style={statLabelStyle}>Bez e-maila</p>
          <p style={statValueStyle}>{missingEmailCompanies.length}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Bez telefonu</p>
          <p style={statValueStyle}>{missingPhoneCompanies.length}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Niska jakość</p>
          <p style={statValueStyle}>{lowQualityCompanies.length}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Niegotowe</p>
          <p style={statValueStyle}>{notReadyCompanies.length}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Błędy importu</p>
          <p style={statValueStyle}>{importErrors.length}</p>
        </div>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Brak adresu e-mail</h2>

        {missingEmailCompanies.length === 0 ? (
          <p>Brak firm bez emaila.</p>
        ) : (
          <CompaniesTable
            companies={missingEmailCompanies}
            contactMap={contactMap}
          />
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Brak telefonu</h2>

        {missingPhoneCompanies.length === 0 ? (
          <p>Brak firm bez telefonu.</p>
        ) : (
          <CompaniesTable
            companies={missingPhoneCompanies}
            contactMap={contactMap}
          />
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Niska jakość danych</h2>

        {lowQualityCompanies.length === 0 ? (
          <p>Brak firm z niską oceną jakości.</p>
        ) : (
          <CompaniesTable
            companies={lowQualityCompanies}
            contactMap={contactMap}
          />
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Niegotowe</h2>

        {notReadyCompanies.length === 0 ? (
          <p>Brak firm ze statusem innym niż ready.</p>
        ) : (
          <CompaniesTable
            companies={notReadyCompanies}
            contactMap={contactMap}
          />
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Błędy importu</h2>

        {importErrors.length === 0 ? (
          <p>Brak błędów importu.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Źródło</th>
                  <th>Status</th>
                  <th>Błąd</th>
                  <th>Data importu</th>
                </tr>
              </thead>
              <tbody>
                {importErrors.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700 }}>
                      {item.company_name ?? "—"}
                    </td>
                    <td>{item.source ?? "—"}</td>
                    <td>
                      <span className="badge badge-error">
                        {item.promotion_status ?? "błąd"}
                      </span>
                    </td>
                    <td>{item.promotion_error ?? "—"}</td>
                    <td>{formatDate(item.imported_at)}</td>
                  </tr>
                ))}
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
          href="/companies"
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
