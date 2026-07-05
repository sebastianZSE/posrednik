import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/core/supabaseAdmin";

function formatDate(value: string | null) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const cardStyle = {
  border: "1px solid #ddd",
  borderRadius: "12px",
  padding: "20px",
  background: "#fff",
} as const;

const statValueStyle = {
  fontSize: "32px",
  fontWeight: 700,
  margin: "4px 0 0",
} as const;

const statLabelStyle = {
  margin: 0,
  color: "#666",
  fontSize: "14px",
} as const;

export default async function Home() {
  const { count: companiesCount, error: companiesError } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true });

  const { count: importsCount, error: importsError } = await supabase
    .from("imports_raw")
    .select("*", { count: "exact", head: true });

  const { count: contactsCount, error: contactsError } = await supabase
    .from("company_contacts")
    .select("*", { count: "exact", head: true });

  const { data: latestImports, error: latestImportsError } = await supabase
    .from("imports_raw")
    .select("id, company_name, city, country, imported_at")
    .order("imported_at", { ascending: false })
    .limit(5);

  const errors = [
    companiesError,
    importsError,
    contactsError,
    latestImportsError,
  ].filter(Boolean);

  return (
    <main style={{ padding: "40px" }}>
      <h1 style={{ margin: 0 }}>Baza firm elektrycznych</h1>
      <p style={{ color: "#666", marginTop: "8px" }}>
        Przegląd stanu bazy i ostatnich importów
      </p>

      {errors.length > 0 && (
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
          {errors.map((error, index) => (
            <p key={index} style={{ margin: "6px 0 0" }}>
              {error?.message}
            </p>
          ))}
        </section>
      )}

      <section
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <div style={cardStyle}>
          <p style={statLabelStyle}>Firmy w bazie</p>
          <p style={statValueStyle}>{companiesCount ?? "—"}</p>
        </div>

        <div style={cardStyle}>
          <p style={statLabelStyle}>Rekordy importu</p>
          <p style={statValueStyle}>{importsCount ?? "—"}</p>
        </div>

        <div style={cardStyle}>
          <p style={statLabelStyle}>Kontakty</p>
          <p style={statValueStyle}>{contactsCount ?? "—"}</p>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: "24px" }}>
        <h2 style={{ marginTop: 0 }}>Ostatnie importy</h2>

        {!latestImports || latestImports.length === 0 ? (
          <p style={{ color: "#666" }}>Brak rekordów importu.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {latestImports.map((item) => (
              <li key={item.id} style={{ marginBottom: "10px" }}>
                <strong>{item.company_name ?? "—"}</strong>
                {" — "}
                {[item.city, item.country].filter(Boolean).join(", ") || "—"}
                {" — "}
                {formatDate(item.imported_at)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "24px", display: "flex", gap: "12px" }}>
        <Link
          href="/companies"
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            textDecoration: "none",
            color: "inherit",
            background: "#fff",
          }}
        >
          Przejdź do firm
        </Link>
      </section>
    </main>
  );
}
