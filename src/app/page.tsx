//To jest strona testowa, która:
//-czyta,
//-zapisuje,
//-pokazuje wynik.


import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

async function addTestImport() {
  "use server";

  const now = new Date().toISOString();
  const stamp = Date.now();

  const { error } = await supabase.from("imports_raw").insert({
    source: "manual_test",
    source_url: "https://example.com/test",
    external_id: `test-${stamp}`,
    company_name: `Test Elektro ${stamp}`,
    category: "Elektroinstallation",
    website: "https://example-elektro.de",
    email: "info@example-elektro.de",
    phone: "+49 30 1234567",
    address: "Teststrasse 1",
    city: "Berlin",
    postal_code: "10115",
    country: "DE",
    raw_payload: {
      created_by: "server_action",
      created_at: now,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
}

export default async function Home() {
  const { count: companiesCount, error: companiesError } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true });

  const { count: importsCount, error: importsError } = await supabase
    .from("imports_raw")
    .select("*", { count: "exact", head: true });

  const { data: latestImports, error: latestImportsError } = await supabase
    .from("imports_raw")
    .select("id, company_name, city, country, imported_at")
    .order("imported_at", { ascending: false })
    .limit(5);

  return (
    <main style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
      <h1>Test połączenia i zapisu do Supabase</h1>

      <section style={{ marginTop: "24px" }}>
        <h2>Status</h2>
        <p>Next.js działa.</p>
        <p>Supabase projekt działa.</p>
        <p>Klient Supabase czyta dane z bazy.</p>
        <p>Teraz testujemy także zapis do imports_raw.</p>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>Wyniki</h2>
        <p>Liczba rekordów w companies: {companiesCount ?? "brak danych"}</p>
        <p>Liczba rekordów w imports_raw: {importsCount ?? "brak danych"}</p>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>Błędy</h2>
        <p>
          companies error: {companiesError ? companiesError.message : "brak"}
        </p>
        <p>imports_raw error: {importsError ? importsError.message : "brak"}</p>
        <p>
          latest imports error:{" "}
          {latestImportsError ? latestImportsError.message : "brak"}
        </p>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Test zapisu</h2>
        <form action={addTestImport}>
          <button
            type="submit"
            style={{
              padding: "12px 18px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            Dodaj testowy rekord do imports_raw
          </button>
        </form>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Ostatnie rekordy z imports_raw</h2>

        {!latestImports || latestImports.length === 0 ? (
          <p>Brak rekordów.</p>
        ) : (
          <ul>
            {latestImports.map((item) => (
              <li
                key={item.id}
                style={{ marginBottom: "10px" }}
              >
                <strong>{item.company_name}</strong> — {item.city},{" "}
                {item.country} — {item.imported_at}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
