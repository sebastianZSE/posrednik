import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL w .env.local");
}

if (!serviceRoleKey) {
  throw new Error("Brakuje SUPABASE_SERVICE_ROLE_KEY w .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const sourceName = "apify_json";
const sourceFileName = "apify.json";

type AnyRecord = Record<string, unknown>;

type ImportBatchRow = {
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

type RawImportInsert = {
  batch_id: string;
  import_key: string;
  source: string;
  source_file_name: string;
  source_url: string | null;
  external_id: string | null;
  company_name: string;
  category: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  raw_payload: AnyRecord;
};

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          return item.trim();
        }

        if (
          item &&
          typeof item === "object" &&
          "name" in item &&
          typeof item.name === "string" &&
          item.name.trim()
        ) {
          return item.name.trim();
        }
      }
    }
  }

  return null;
}

function normalizeKeyPart(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildImportKey(params: {
  source: string;
  externalId: string | null;
  sourceUrl: string | null;
  companyName: string;
  city: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
}) {
  const normalizedSource = normalizeKeyPart(params.source);

  if (params.externalId) {
    return `${normalizedSource}|externalId|${normalizeKeyPart(params.externalId)}`;
  }

  if (params.sourceUrl) {
    return `${normalizedSource}|sourceUrl|${normalizeKeyPart(params.sourceUrl)}`;
  }

  return [
    `${normalizedSource}|fallback`,
    normalizeKeyPart(params.companyName),
    normalizeKeyPart(params.city),
    normalizeKeyPart(params.country),
    normalizeKeyPart(params.phone),
    normalizeKeyPart(params.website),
  ].join("|");
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function mapApifyRecord(
  item: AnyRecord,
  batchId: string,
): RawImportInsert | null {
  const companyName = firstString(
    item.company_name,
    item.companyName,
    item.title,
    item.name,
  );

  if (!companyName) {
    return null;
  }

  const sourceUrl = firstString(item.url, item.sourceUrl, item.googleMapsUrl);
  const externalId = firstString(item.placeId, item.id);
  const website = firstString(item.website, item.websiteUrl);
  const email = firstString(item.email, item.emails);
  const phone = firstString(
    item.phoneUnformatted,
    item.phone,
    item.phones,
    item.phoneNumber,
  );
  const address = firstString(item.address, item.street, item.fullAddress);
  const city = firstString(item.city, item.town);
  const postalCode = firstString(item.postalCode, item.postcode, item.zip);
  const country = firstString(item.countryCode, item.country);
  const category = firstString(
    item.categoryName,
    item.category,
    item.categories,
  );

  const importKey = buildImportKey({
    source: sourceName,
    externalId,
    sourceUrl,
    companyName,
    city,
    country,
    phone,
    website,
  });

  return {
    batch_id: batchId,
    import_key: importKey,
    source: sourceName,
    source_file_name: sourceFileName,
    source_url: sourceUrl,
    external_id: externalId,
    company_name: companyName,
    category,
    website,
    email,
    phone,
    address,
    city,
    postal_code: postalCode,
    country,
    raw_payload: item,
  };
}

async function createImportBatch(params: {
  sourceFileHash: string;
  batchStatus: string;
  rowsTotal: number;
  rowsMapped: number;
  rowsInserted: number;
  rowsDuplicates: number;
  rowsErrors: number;
  notes?: string;
  finishedAt?: string;
}) {
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      source_name: sourceName,
      source_file_name: sourceFileName,
      source_file_hash: params.sourceFileHash,
      batch_status: params.batchStatus,
      rows_total: params.rowsTotal,
      rows_mapped: params.rowsMapped,
      rows_inserted: params.rowsInserted,
      rows_duplicates: params.rowsDuplicates,
      rows_errors: params.rowsErrors,
      notes: params.notes ?? null,
      finished_at: params.finishedAt ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Blad przy tworzeniu import_batch: ${error.message}`);
  }

  return data as ImportBatchRow;
}

async function updateImportBatch(
  batchId: string,
  params: {
    batchStatus?: string;
    rowsTotal?: number;
    rowsMapped?: number;
    rowsInserted?: number;
    rowsDuplicates?: number;
    rowsErrors?: number;
    notes?: string;
    finishedAt?: string;
  },
) {
  const patch: Record<string, unknown> = {};

  if (params.batchStatus !== undefined) patch.batch_status = params.batchStatus;
  if (params.rowsTotal !== undefined) patch.rows_total = params.rowsTotal;
  if (params.rowsMapped !== undefined) patch.rows_mapped = params.rowsMapped;
  if (params.rowsInserted !== undefined)
    patch.rows_inserted = params.rowsInserted;
  if (params.rowsDuplicates !== undefined)
    patch.rows_duplicates = params.rowsDuplicates;
  if (params.rowsErrors !== undefined) patch.rows_errors = params.rowsErrors;
  if (params.notes !== undefined) patch.notes = params.notes;
  if (params.finishedAt !== undefined) patch.finished_at = params.finishedAt;

  const { error } = await supabase
    .from("import_batches")
    .update(patch)
    .eq("id", batchId);

  if (error) {
    throw new Error(`Blad przy aktualizacji import_batch: ${error.message}`);
  }
}

async function findFinishedBatchByHash(sourceFileHash: string) {
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("source_name", sourceName)
    .eq("source_file_hash", sourceFileHash)
    .eq("batch_status", "finished")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Blad przy szukaniu duplikatu batcha: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as ImportBatchRow;
}

async function getExistingImportKeys(importKeys: string[]) {
  const existingKeys = new Set<string>();

  const chunks = chunkArray(importKeys, 500);

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("imports_raw")
      .select("import_key")
      .in("import_key", chunk);

    if (error) {
      throw new Error(
        `Blad przy pobieraniu istniejacych import_key: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (row.import_key) {
        existingKeys.add(row.import_key);
      }
    }
  }

  return existingKeys;
}

async function main() {
  const filePath = path.join(process.cwd(), "data", sourceFileName);
  const fileContent = await fs.readFile(filePath, "utf8");
  const sourceFileHash = createHash("sha256").update(fileContent).digest("hex");

  const parsed = JSON.parse(fileContent);

  if (!Array.isArray(parsed)) {
    throw new Error("Plik apify.json musi zawierac tablice rekordow JSON");
  }

  console.log(`Wczytano rekordow z pliku: ${parsed.length}`);

  const existingFinishedBatch = await findFinishedBatchByHash(sourceFileHash);

  if (existingFinishedBatch) {
    const skippedBatch = await createImportBatch({
      sourceFileHash,
      batchStatus: "skipped_duplicate_file",
      rowsTotal: parsed.length,
      rowsMapped: 0,
      rowsInserted: 0,
      rowsDuplicates: parsed.length,
      rowsErrors: 0,
      notes: `Plik byl juz zaimportowany w batchu ${existingFinishedBatch.id}`,
      finishedAt: new Date().toISOString(),
    });

    console.log(`Wykryto duplikat pliku. Import pominiety.`);
    console.log(`Nowy log batcha: ${skippedBatch.id}`);
    console.log(`Poprzedni finished batch: ${existingFinishedBatch.id}`);
    return;
  }

  const runningBatch = await createImportBatch({
    sourceFileHash,
    batchStatus: "running",
    rowsTotal: parsed.length,
    rowsMapped: 0,
    rowsInserted: 0,
    rowsDuplicates: 0,
    rowsErrors: 0,
  });

  console.log(`Utworzono importBatch: ${runningBatch.id}`);

  try {
    const mappedWithNulls = parsed.map((item) =>
      mapApifyRecord(item as AnyRecord, runningBatch.id),
    );

    const mapped = mappedWithNulls.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );

    const rowsMapped = mapped.length;
    const rowsErrors = parsed.length - rowsMapped;

    const uniqueMap = new Map<string, RawImportInsert>();

    for (const item of mapped) {
      if (!uniqueMap.has(item.import_key)) {
        uniqueMap.set(item.import_key, item);
      }
    }

    const uniqueMapped = [...uniqueMap.values()];
    const duplicatesInsideFile = mapped.length - uniqueMapped.length;

    const allImportKeys = uniqueMapped.map((item) => item.import_key);
    const existingImportKeys = await getExistingImportKeys(allImportKeys);

    const rowsToInsert = uniqueMapped.filter(
      (item) => !existingImportKeys.has(item.import_key),
    );

    const duplicatesAlreadyInDatabase =
      uniqueMapped.length - rowsToInsert.length;
    const rowsDuplicates = duplicatesInsideFile + duplicatesAlreadyInDatabase;

    let rowsInserted = 0;
    const insertChunks = chunkArray(rowsToInsert, 500);

    for (const chunk of insertChunks) {
      const { error } = await supabase.from("imports_raw").insert(chunk);

      if (error) {
        throw new Error(`Blad przy insercie do imports_raw: ${error.message}`);
      }

      rowsInserted += chunk.length;
      console.log(
        `Dodano batch insertu: ${rowsInserted}/${rowsToInsert.length}`,
      );
    }

    await updateImportBatch(runningBatch.id, {
      batchStatus: "finished",
      rowsTotal: parsed.length,
      rowsMapped,
      rowsInserted,
      rowsDuplicates,
      rowsErrors,
      notes: `Import zakonczony poprawnie`,
      finishedAt: new Date().toISOString(),
    });

    console.log(`Import zakonczony poprawnie.`);
    console.log(`rowsMapped=${rowsMapped}`);
    console.log(`rowsInserted=${rowsInserted}`);
    console.log(`rowsDuplicates=${rowsDuplicates}`);
    console.log(`rowsErrors=${rowsErrors}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Nieznany blad";

    await updateImportBatch(runningBatch.id, {
      batchStatus: "error",
      notes: errorMessage,
      finishedAt: new Date().toISOString(),
    });

    throw error;
  }
}

main().catch((error) => {
  console.error("Import nie udal sie:");
  console.error(error);
  process.exit(1);
});
