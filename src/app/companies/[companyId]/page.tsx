//pojedyncza firma - szczegóły, kontakty, źródłowe rekordy importu

import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/core/supabaseAdmin";

type CompanyDetailsPageProps = {
  params: Promise<{
    companyId: string;
  }>;
};

type CompanyItem = {
  id: string;
  company_name: string | null;
  legal_name: string | null;
  normalized_name: string | null;
  domain: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  category: string | null;
  status: string | null;
  quality_score: number | null;
  created_at: string | null;
  updated_at: string | null;
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

type ImportItem = {
  id: string;
  source: string | null;
  source_url: string | null;
  company_name: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  category: string | null;
  promotion_status: string | null;
  imported_at: string | null;
  promoted_at: string | null;
};

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

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px solid #eee",
      }}
    >
      <span className="muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default async function CompanyDetailsPage({
  params,
}: CompanyDetailsPageProps) {
  const { companyId } = await params;

  const { data: companyData, error: companyError } = await supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, normalized_name, domain, website, address, city, postal_code, country, category, status, quality_score, created_at, updated_at",
    )
    .eq("id", companyId)
    .single();

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select(
      "id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at",
    )
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: importsData, error: importsError } = await supabase
    .from("imports_raw")
    .select(
      "id, source, source_url, company_name, website, email, phone, address, city, postal_code, country, category, promotion_status, imported_at, promoted_at",
    )
    .eq("company_id", companyId)
    .order("imported_at", { ascending: false });

  if (companyError) {
    return (
      <main style={{ padding: "40px" }}>
        <h1>Szczegóły firmy</h1>
        <p>Wystąpił błąd przy pobieraniu firmy.</p>
        <p className="muted">{companyError.message}</p>
        <Link
          href="/companies"
          className="btn"
        >
          Wróć do listy firm
        </Link>
      </main>
    );
  }

  if (!companyData) {
    return (
      <main style={{ padding: "40px" }}>
        <h1>Szczegóły firmy</h1>
        <p>Nie znaleziono firmy.</p>
        <Link
          href="/companies"
          className="btn"
        >
          Wróć do listy firm
        </Link>
      </main>
    );
  }

  const company = companyData as CompanyItem;
  const contacts = (contactsData ?? []) as ContactItem[];
  const imports = (importsData ?? []) as ImportItem[];

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
        <h1 style={{ margin: 0 }}>
          {company.company_name ?? "Szczegóły firmy"}
        </h1>

        <Link
          href="/companies"
          className="btn"
        >
          Wróć do listy firm
        </Link>
      </div>

      <section
        className="card"
        style={{ marginTop: "24px" }}
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
          <h2 style={{ margin: 0 }}>Dane firmy</h2>

          <span className={getStatusBadgeClass(company.status)}>
            {company.status ?? "brak"}
          </span>
        </div>

        <div style={{ marginTop: "16px" }}>
          <InfoRow label="Nazwa prawna">{company.legal_name ?? "—"}</InfoRow>
          <InfoRow label="Nazwa znormalizowana">
            {company.normalized_name ?? "—"}
          </InfoRow>
          <InfoRow label="Domena">{company.domain ?? "—"}</InfoRow>
          <InfoRow label="Strona WWW">
            {company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer"
              >
                {company.website}
              </a>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow label="Adres">{company.address ?? "—"}</InfoRow>
          <InfoRow label="Miasto">{company.city ?? "—"}</InfoRow>
          <InfoRow label="Kod pocztowy">{company.postal_code ?? "—"}</InfoRow>
          <InfoRow label="Kraj">{company.country ?? "—"}</InfoRow>
          <InfoRow label="Kategoria">{company.category ?? "—"}</InfoRow>
          <InfoRow label="Ocena jakości">
            {company.quality_score ?? "—"}
          </InfoRow>
          <InfoRow label="Utworzono">{formatDate(company.created_at)}</InfoRow>
          <InfoRow label="Zaktualizowano">
            {formatDate(company.updated_at)}
          </InfoRow>
        </div>
      </section>

      <section
        className="card"
        style={{ marginTop: "24px" }}
      >
        <h2 style={{ marginTop: 0 }}>Kontakty</h2>

        {contactsError && (
          <p style={{ color: "#9f3a38" }}>
            Błąd pobierania kontaktów: {contactsError.message}
          </p>
        )}

        {contacts.length === 0 ? (
          <p>Brak kontaktów.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Wartość</th>
                  <th>Znormalizowana</th>
                  <th>Główny</th>
                  <th>Zweryfikowany</th>
                  <th>Źródło</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      {contact.contact_type === "email" ? "e-mail" : "telefon"}
                    </td>
                    <td style={{ fontWeight: 700 }}>{contact.contact_value}</td>
                    <td>{contact.normalized_value ?? "—"}</td>
                    <td>{contact.is_primary ? "tak" : "—"}</td>
                    <td>{contact.is_verified ? "tak" : "—"}</td>
                    <td>{contact.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="card"
        style={{ marginTop: "24px" }}
      >
        <h2 style={{ marginTop: 0 }}>Rekordy źródłowe</h2>

        {importsError && (
          <p style={{ color: "#9f3a38" }}>
            Błąd pobierania rekordów źródłowych: {importsError.message}
          </p>
        )}

        {imports.length === 0 ? (
          <p>Brak rekordów źródłowych.</p>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {imports.map((item) => (
              <article
                key={item.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "10px",
                  padding: "16px",
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
                  <strong>{item.company_name ?? "—"}</strong>

                  <span className="muted" style={{ fontSize: "13px" }}>
                    {item.source ?? "—"}
                    {item.source_url && (
                      <>
                        {" · "}
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          otwórz źródło
                        </a>
                      </>
                    )}
                  </span>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <InfoRow label="Strona WWW">{item.website ?? "—"}</InfoRow>
                  <InfoRow label="E-mail">{item.email ?? "—"}</InfoRow>
                  <InfoRow label="Telefon">{item.phone ?? "—"}</InfoRow>
                  <InfoRow label="Adres">
                    {[item.address, item.postal_code, item.city, item.country]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </InfoRow>
                  <InfoRow label="Kategoria">{item.category ?? "—"}</InfoRow>
                  <InfoRow label="Status promocji">
                    {item.promotion_status ?? "—"}
                  </InfoRow>
                  <InfoRow label="Zaimportowano">
                    {formatDate(item.imported_at)}
                  </InfoRow>
                  <InfoRow label="Wypromowano">
                    {formatDate(item.promoted_at)}
                  </InfoRow>
                </div>
              </article>
            ))}
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
          Wróć do listy firm
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
