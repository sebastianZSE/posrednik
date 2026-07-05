import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/core/supabaseAdmin";

type ImportBatchItem = {
  id: string;
  source_name: string;
  source_file_name: string;
  source_file_hash: string;
  batch_status: string;
  rows_total: number;
  rows_mapped: number;
  rows_inserted: number;
  rows_duplicates: number;
  rows_errors: number;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pl-PL");
}

function getBatchStatusLabel(status: string) {
  if (status === "finished") return "zakończony";
  if (status === "running") return "w trakcie";
  if (status === "error") return "błąd";
  if (status === "skipped_duplicate_file") return "pominięty (duplikat)";
  return status;
}

function getBatchStatusBadgeClass(status: string) {
  if (status === "finished") return "badge badge-ready";
  if (status === "running") return "badge badge-enrich";
  if (status === "error") return "badge badge-error";
  if (status === "skipped_duplicate_file") return "badge badge-skip";
  return "badge";
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

export default async function ImportBatchesPage() {
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, source_name, source_file_name, source_file_hash, batch_status, rows_total, rows_mapped, rows_inserted, rows_duplicates, rows_errors, notes, started_at, finished_at",
    )
    .order("started_at", { ascending: false });

  const importBatches = (data ?? []) as ImportBatchItem[];

  const finishedCount = importBatches.filter(
    (batch) => batch.batch_status === "finished",
  ).length;

  const runningCount = importBatches.filter(
    (batch) => batch.batch_status === "running",
  ).length;

  const errorCount = importBatches.filter(
    (batch) => batch.batch_status === "error",
  ).length;

  const skippedDuplicateFileCount = importBatches.filter(
    (batch) => batch.batch_status === "skipped_duplicate_file",
  ).length;

  const totalRows = importBatches.reduce(
    (sum, batch) => sum + (batch.rows_total ?? 0),
    0,
  );

  const totalInserted = importBatches.reduce(
    (sum, batch) => sum + (batch.rows_inserted ?? 0),
    0,
  );

  const totalDuplicates = importBatches.reduce(
    (sum, batch) => sum + (batch.rows_duplicates ?? 0),
    0,
  );

  const totalErrors = importBatches.reduce(
    (sum, batch) => sum + (batch.rows_errors ?? 0),
    0,
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
        <h1 style={{ margin: 0 }}>Importy</h1>

        <Link
          href="/companies"
          className="btn"
        >
          Wróć do firm
        </Link>
      </div>

      {error && (
        <section className="error-box">
          <strong>Wystąpił błąd podczas pobierania danych:</strong>
          <p style={{ margin: "6px 0 0" }}>{error.message}</p>
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
          <p style={statLabelStyle}>Partie importu</p>
          <p style={statValueStyle}>{importBatches.length}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Zakończone</p>
          <p style={statValueStyle}>{finishedCount}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>W trakcie</p>
          <p style={statValueStyle}>{runningCount}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Błędy partii</p>
          <p style={statValueStyle}>{errorCount}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Pominięte (duplikat pliku)</p>
          <p style={statValueStyle}>{skippedDuplicateFileCount}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Wiersze łącznie</p>
          <p style={statValueStyle}>{totalRows}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Wstawione</p>
          <p style={statValueStyle}>{totalInserted}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Duplikaty</p>
          <p style={statValueStyle}>{totalDuplicates}</p>
        </div>

        <div style={statCardStyle}>
          <p style={statLabelStyle}>Wiersze z błędami</p>
          <p style={statValueStyle}>{totalErrors}</p>
        </div>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>Lista partii importu</h2>

        {importBatches.length === 0 ? (
          <p>Brak partii importu.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plik</th>
                  <th>Status</th>
                  <th>Wiersze</th>
                  <th>Zmapowane</th>
                  <th>Wstawione</th>
                  <th>Duplikaty</th>
                  <th>Błędy</th>
                  <th>Rozpoczęto</th>
                  <th>Zakończono</th>
                  <th>Notatki</th>
                </tr>
              </thead>
              <tbody>
                {importBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <span
                        style={{ fontWeight: 700 }}
                        title={`id: ${batch.id} | hash: ${batch.source_file_hash}`}
                      >
                        {batch.source_file_name}
                      </span>
                      <div
                        className="muted"
                        style={{ fontSize: "13px", marginTop: "4px" }}
                      >
                        {batch.source_name}
                      </div>
                    </td>
                    <td>
                      <span
                        className={getBatchStatusBadgeClass(batch.batch_status)}
                      >
                        {getBatchStatusLabel(batch.batch_status)}
                      </span>
                    </td>
                    <td>{batch.rows_total}</td>
                    <td>{batch.rows_mapped}</td>
                    <td>{batch.rows_inserted}</td>
                    <td>{batch.rows_duplicates}</td>
                    <td>{batch.rows_errors}</td>
                    <td>{formatDate(batch.started_at)}</td>
                    <td>{formatDate(batch.finished_at)}</td>
                    <td>{batch.notes ?? "—"}</td>
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
