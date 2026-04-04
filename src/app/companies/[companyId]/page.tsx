//pojedyncza firma - szczegóły, kontakty, źródłowe rekordy importu

import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

function getStatusLabel(status: string | null) {
  if (!status) return "brak";
  return status;
}

function getQualityLabel(score: number | null) {
  if (score === null || score === undefined) return "brak";
  return String(score);
}

function formatDate(value: string | null) {
  if (!value) return "brak";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pl-PL");
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
      <main style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
        <h1>CompanyDetails</h1>
        <p>Wystąpił błąd przy pobieraniu firmy.</p>
        <p>{companyError.message}</p>
        <Link href="/companies">Wróć do listy firm</Link>
      </main>
    );
  }

  if (!companyData) {
    return (
      <main style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
        <h1>CompanyDetails</h1>
        <p>Nie znaleziono firmy.</p>
        <Link href="/companies">Wróć do listy firm</Link>
      </main>
    );
  }

  const company = companyData as CompanyItem;
  const contacts = (contactsData ?? []) as ContactItem[];
  const imports = (importsData ?? []) as ImportItem[];

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
        <h1 style={{ margin: 0 }}>CompanyDetails</h1>

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
          Wróć do listy firm
        </Link>
      </div>

      <section
        style={{
          marginTop: "24px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>{company.company_name ?? "brak nazwy"}</h2>

        <p>
          <strong>legalName:</strong> {company.legal_name ?? "brak"}
        </p>
        <p>
          <strong>normalizedName:</strong> {company.normalized_name ?? "brak"}
        </p>
        <p>
          <strong>domain:</strong> {company.domain ?? "brak"}
        </p>
        <p>
          <strong>website:</strong>{" "}
          {company.website ? (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
            >
              {company.website}
            </a>
          ) : (
            "brak"
          )}
        </p>
        <p>
          <strong>address:</strong> {company.address ?? "brak"}
        </p>
        <p>
          <strong>city:</strong> {company.city ?? "brak"}
        </p>
        <p>
          <strong>postalCode:</strong> {company.postal_code ?? "brak"}
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
        <p>
          <strong>createdAt:</strong> {formatDate(company.created_at)}
        </p>
        <p>
          <strong>updatedAt:</strong> {formatDate(company.updated_at)}
        </p>
      </section>

      <section
        style={{
          marginTop: "24px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Contacts</h2>

        <p>contacts error: {contactsError ? contactsError.message : "brak"}</p>

        {contacts.length === 0 ? (
          <p>Brak kontaktów.</p>
        ) : (
          <ul style={{ paddingLeft: "20px" }}>
            {contacts.map((contact) => (
              <li
                key={contact.id}
                style={{ marginBottom: "10px" }}
              >
                <strong>{contact.contact_type}</strong>: {contact.contact_value}
                {contact.is_primary ? " | primary" : ""}
                {contact.is_verified ? " | verified" : ""}
                {contact.source ? ` | source: ${contact.source}` : ""}
                {contact.normalized_value
                  ? ` | normalized: ${contact.normalized_value}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{
          marginTop: "24px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>SourceImports</h2>

        <p>imports error: {importsError ? importsError.message : "brak"}</p>

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
                  padding: "14px",
                }}
              >
                <p>
                  <strong>source:</strong> {item.source ?? "brak"}
                </p>
                <p>
                  <strong>sourceUrl:</strong>{" "}
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      otwórz źródło
                    </a>
                  ) : (
                    "brak"
                  )}
                </p>
                <p>
                  <strong>companyName:</strong> {item.company_name ?? "brak"}
                </p>
                <p>
                  <strong>website:</strong> {item.website ?? "brak"}
                </p>
                <p>
                  <strong>email:</strong> {item.email ?? "brak"}
                </p>
                <p>
                  <strong>phone:</strong> {item.phone ?? "brak"}
                </p>
                <p>
                  <strong>address:</strong> {item.address ?? "brak"}
                </p>
                <p>
                  <strong>city:</strong> {item.city ?? "brak"}
                </p>
                <p>
                  <strong>postalCode:</strong> {item.postal_code ?? "brak"}
                </p>
                <p>
                  <strong>country:</strong> {item.country ?? "brak"}
                </p>
                <p>
                  <strong>category:</strong> {item.category ?? "brak"}
                </p>
                <p>
                  <strong>promotionStatus:</strong>{" "}
                  {item.promotion_status ?? "brak"}
                </p>
                <p>
                  <strong>importedAt:</strong> {formatDate(item.imported_at)}
                </p>
                <p>
                  <strong>promotedAt:</strong> {formatDate(item.promoted_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
