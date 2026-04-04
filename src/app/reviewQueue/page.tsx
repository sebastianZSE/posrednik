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
  if (!value) return "brak";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pl-PL");
}

function CompanyCard({
  company,
  contacts,
}: {
  company: CompanyItem;
  contacts: ContactItem[];
}) {
  return (
    <article
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
        <h3 style={{ margin: 0 }}>{company.company_name ?? "brak nazwy"}</h3>

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
          <strong>qualityScore:</strong> {company.quality_score ?? "brak"}
        </p>
        <p>
          <strong>contactsCount:</strong> {contacts.length}
        </p>
      </div>
    </article>
  );
}

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
        <h1 style={{ margin: 0 }}>ReviewQueue</h1>

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
          Wróć do companies
        </Link>
      </div>

      <section style={{ marginTop: "24px" }}>
        <p>
          companies error: {companiesError ? companiesError.message : "brak"}
        </p>
        <p>contacts error: {contactsError ? contactsError.message : "brak"}</p>
        <p>
          importErrors error:{" "}
          {importErrorsError ? importErrorsError.message : "brak"}
        </p>
      </section>

      <section
        style={{
          marginTop: "24px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>missingEmailCount:</strong> {missingEmailCompanies.length}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>missingPhoneCount:</strong> {missingPhoneCompanies.length}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>lowQualityCount:</strong> {lowQualityCompanies.length}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>notReadyCount:</strong> {notReadyCompanies.length}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>importErrorsCount:</strong> {importErrors.length}
        </div>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>MissingEmail</h2>

        {missingEmailCompanies.length === 0 ? (
          <p>Brak firm bez emaila.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {missingEmailCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                contacts={contactMap.get(company.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>MissingPhone</h2>

        {missingPhoneCompanies.length === 0 ? (
          <p>Brak firm bez telefonu.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {missingPhoneCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                contacts={contactMap.get(company.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>LowQuality</h2>

        {lowQualityCompanies.length === 0 ? (
          <p>Brak firm z niskim qualityScore.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {lowQualityCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                contacts={contactMap.get(company.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>NotReady</h2>

        {notReadyCompanies.length === 0 ? (
          <p>Brak firm ze statusem innym niż ready.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {notReadyCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                contacts={contactMap.get(company.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>ImportErrors</h2>

        {importErrors.length === 0 ? (
          <p>Brak błędów promotion.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {importErrors.map((item) => (
              <article
                key={item.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "20px",
                }}
              >
                <p>
                  <strong>companyName:</strong> {item.company_name ?? "brak"}
                </p>
                <p>
                  <strong>source:</strong> {item.source ?? "brak"}
                </p>
                <p>
                  <strong>promotionStatus:</strong>{" "}
                  {item.promotion_status ?? "brak"}
                </p>
                <p>
                  <strong>promotionError:</strong>{" "}
                  {item.promotion_error ?? "brak"}
                </p>
                <p>
                  <strong>importedAt:</strong> {formatDate(item.imported_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
