import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
  if (!value) return "brak";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pl-PL");
}

function getBatchStatusLabel(status: string) {
  if (status === "finished") return "finished";
  if (status === "running") return "running";
  if (status === "error") return "error";
  if (status === "skipped_duplicate_file") return "skipped_duplicate_file";
  return status;
}

function getBatchStatusStyle(status: string) {
  if (status === "finished") {
    return {
      padding: "6px 10px",
      borderRadius: "999px",
      border: "1px solid #ccc",
      display: "inline-block",
      fontWeight: 700,
    } as const;
  }

  if (status === "running") {
    return {
      padding: "6px 10px",
      borderRadius: "999px",
      border: "1px solid #ccc",
      display: "inline-block",
      fontWeight: 700,
    } as const;
  }

  if (status === "error") {
    return {
      padding: "6px 10px",
      borderRadius: "999px",
      border: "1px solid #ccc",
      display: "inline-block",
      fontWeight: 700,
    } as const;
  }

  return {
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid #ccc",
    display: "inline-block",
    fontWeight: 700,
  } as const;
}

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
        <h1 style={{ margin: 0 }}>ImportBatches</h1>

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
        <p>importBatches error: {error ? error.message : "brak"}</p>
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
          <strong>batchesCount:</strong> {importBatches.length}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>finishedCount:</strong> {finishedCount}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>runningCount:</strong> {runningCount}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>errorCount:</strong> {errorCount}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>skippedDuplicateFileCount:</strong>{" "}
          {skippedDuplicateFileCount}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>totalRows:</strong> {totalRows}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>totalInserted:</strong> {totalInserted}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>totalDuplicates:</strong> {totalDuplicates}
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <strong>totalErrors:</strong> {totalErrors}
        </div>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2>BatchList</h2>

        {importBatches.length === 0 ? (
          <p>Brak batchy importu.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {importBatches.map((batch) => (
              <article
                key={batch.id}
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
                  <h3 style={{ margin: 0 }}>{batch.source_file_name}</h3>

                  <span style={getBatchStatusStyle(batch.batch_status)}>
                    {getBatchStatusLabel(batch.batch_status)}
                  </span>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <p>
                    <strong>batchId:</strong> {batch.id}
                  </p>
                  <p>
                    <strong>sourceName:</strong> {batch.source_name}
                  </p>
                  <p>
                    <strong>sourceFileName:</strong> {batch.source_file_name}
                  </p>
                  <p>
                    <strong>sourceFileHash:</strong> {batch.source_file_hash}
                  </p>
                  <p>
                    <strong>rowsTotal:</strong> {batch.rows_total}
                  </p>
                  <p>
                    <strong>rowsMapped:</strong> {batch.rows_mapped}
                  </p>
                  <p>
                    <strong>rowsInserted:</strong> {batch.rows_inserted}
                  </p>
                  <p>
                    <strong>rowsDuplicates:</strong> {batch.rows_duplicates}
                  </p>
                  <p>
                    <strong>rowsErrors:</strong> {batch.rows_errors}
                  </p>
                  <p>
                    <strong>startedAt:</strong> {formatDate(batch.started_at)}
                  </p>
                  <p>
                    <strong>finishedAt:</strong> {formatDate(batch.finished_at)}
                  </p>
                  <p>
                    <strong>notes:</strong> {batch.notes ?? "brak"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
