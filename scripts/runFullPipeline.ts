import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
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

const exportsDirPath = path.join(process.cwd(), "exports");

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

function runCommand(scriptName: string) {
  console.log(`\n=== Start: ${scriptName} ===`);

  try {
    execSync(`npm run ${scriptName}`, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
      //   shell: true,
    });
  } catch (error) {
    throw new Error(
      `Skrypt "${scriptName}" zakonczyl sie bledem: ${(error as Error).message}`,
    );
  }

  console.log(`=== Koniec: ${scriptName} ===\n`);
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

function hasEmail(contacts: ContactItem[]) {
  return contacts.some((contact) => contact.contact_type === "email");
}

function hasPhone(contacts: ContactItem[]) {
  return contacts.some((contact) => contact.contact_type === "phone");
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
  return fallback?.contact_value ?? "";
}

function getAllContacts(
  contacts: ContactItem[],
  contactType: "phone" | "email",
) {
  return contacts
    .filter((contact) => contact.contact_type === contactType)
    .map((contact) => contact.contact_value)
    .join(" | ");
}

function getEnrichAction(contacts: ContactItem[]) {
  const emailExists = hasEmail(contacts);
  const phoneExists = hasPhone(contacts);

  if (phoneExists && !emailExists) return "findEmail";
  if (!phoneExists && emailExists) return "findPhone";
  if (!phoneExists && !emailExists) return "findEmailAndPhone";
  return "none";
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  const escapedValue = stringValue.replace(/"/g, '""');
  return `"${escapedValue}"`;
}

function buildCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function buildReadyCsvRows(params: {
  companies: CompanyItem[];
  contactMap: Map<string, ContactItem[]>;
}) {
  const rows: string[][] = [
    [
      "companyId",
      "companyName",
      "legalName",
      "domain",
      "website",
      "city",
      "country",
      "category",
      "status",
      "qualityScore",
      "primaryPhone",
      "allPhones",
      "primaryEmail",
      "allEmails",
      "contactsCount",
      "createdAt",
    ],
  ];

  for (const company of params.companies) {
    const contacts = params.contactMap.get(company.id) ?? [];

    rows.push([
      company.id,
      company.company_name ?? "",
      company.legal_name ?? "",
      company.domain ?? "",
      company.website ?? "",
      company.city ?? "",
      company.country ?? "",
      company.category ?? "",
      company.status ?? "",
      String(company.quality_score ?? ""),
      getPrimaryContact(contacts, "phone"),
      getAllContacts(contacts, "phone"),
      getPrimaryContact(contacts, "email"),
      getAllContacts(contacts, "email"),
      String(contacts.length),
      company.created_at ?? "",
    ]);
  }

  return rows;
}

function buildEnrichCsvRows(params: {
  companies: CompanyItem[];
  contactMap: Map<string, ContactItem[]>;
}) {
  const rows: string[][] = [
    [
      "companyId",
      "companyName",
      "legalName",
      "domain",
      "website",
      "city",
      "country",
      "category",
      "status",
      "qualityScore",
      "hasPhone",
      "hasEmail",
      "needsPhone",
      "needsEmail",
      "enrichAction",
      "primaryPhone",
      "allPhones",
      "primaryEmail",
      "allEmails",
      "contactsCount",
      "createdAt",
    ],
  ];

  for (const company of params.companies) {
    const contacts = params.contactMap.get(company.id) ?? [];
    const emailExists = hasEmail(contacts);
    const phoneExists = hasPhone(contacts);

    rows.push([
      company.id,
      company.company_name ?? "",
      company.legal_name ?? "",
      company.domain ?? "",
      company.website ?? "",
      company.city ?? "",
      company.country ?? "",
      company.category ?? "",
      company.status ?? "",
      String(company.quality_score ?? ""),
      phoneExists ? "yes" : "no",
      emailExists ? "yes" : "no",
      phoneExists ? "no" : "yes",
      emailExists ? "no" : "yes",
      getEnrichAction(contacts),
      getPrimaryContact(contacts, "phone"),
      getAllContacts(contacts, "phone"),
      getPrimaryContact(contacts, "email"),
      getAllContacts(contacts, "email"),
      String(contacts.length),
      company.created_at ?? "",
    ]);
  }

  return rows;
}

async function ensureExportsDir() {
  await fs.mkdir(exportsDirPath, { recursive: true });
}

async function fetchPipelineData() {
  const { data: companiesData, error: companiesError } = await supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at",
    )
    .order("created_at", { ascending: false });

  if (companiesError) {
    throw new Error(
      `Blad przy pobieraniu companies: ${companiesError.message}`,
    );
  }

  const { data: contactsData, error: contactsError } = await supabase
    .from("company_contacts")
    .select(
      "id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at",
    )
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (contactsError) {
    throw new Error(
      `Blad przy pobieraniu company_contacts: ${contactsError.message}`,
    );
  }

  const { data: importBatchesData, error: importBatchesError } = await supabase
    .from("import_batches")
    .select(
      "id, source_name, source_file_name, source_file_hash, batch_status, rows_total, rows_mapped, rows_inserted, rows_duplicates, rows_errors, notes, started_at, finished_at",
    )
    .order("started_at", { ascending: false })
    .limit(10);

  if (importBatchesError) {
    throw new Error(
      `Blad przy pobieraniu import_batches: ${importBatchesError.message}`,
    );
  }

  return {
    companies: (companiesData ?? []) as CompanyItem[],
    contacts: (contactsData ?? []) as ContactItem[],
    importBatches: (importBatchesData ?? []) as ImportBatchItem[],
  };
}

async function writeExportFiles(params: {
  companies: CompanyItem[];
  contacts: ContactItem[];
  importBatches: ImportBatchItem[];
}) {
  const contactMap = groupContactsByCompany(params.contacts);

  const readyCompanies = params.companies.filter(
    (company) => company.status === "ready",
  );
  const enrichCompanies = params.companies.filter(
    (company) => company.status === "enrich",
  );
  const skipCompanies = params.companies.filter(
    (company) => company.status === "skip",
  );

  const readyCsv = buildCsv(
    buildReadyCsvRows({
      companies: readyCompanies,
      contactMap,
    }),
  );

  const enrichCsv = buildCsv(
    buildEnrichCsvRows({
      companies: enrichCompanies,
      contactMap,
    }),
  );

  await fs.writeFile(
    path.join(exportsDirPath, "readyCompanies.csv"),
    readyCsv,
    "utf8",
  );
  await fs.writeFile(
    path.join(exportsDirPath, "enrichCompanies.csv"),
    enrichCsv,
    "utf8",
  );

  const latestBatch = params.importBatches[0] ?? null;

  const summary = {
    generatedAt: new Date().toISOString(),
    counts: {
      allCompanies: params.companies.length,
      readyCompanies: readyCompanies.length,
      enrichCompanies: enrichCompanies.length,
      skipCompanies: skipCompanies.length,
      allContacts: params.contacts.length,
    },
    latestBatch: latestBatch
      ? {
          id: latestBatch.id,
          sourceName: latestBatch.source_name,
          sourceFileName: latestBatch.source_file_name,
          batchStatus: latestBatch.batch_status,
          rowsTotal: latestBatch.rows_total,
          rowsMapped: latestBatch.rows_mapped,
          rowsInserted: latestBatch.rows_inserted,
          rowsDuplicates: latestBatch.rows_duplicates,
          rowsErrors: latestBatch.rows_errors,
          startedAt: latestBatch.started_at,
          finishedAt: latestBatch.finished_at,
          notes: latestBatch.notes,
        }
      : null,
    files: {
      readyCompaniesCsv: "exports/readyCompanies.csv",
      enrichCompaniesCsv: "exports/enrichCompanies.csv",
      pipelineSummaryJson: "exports/pipelineSummary.json",
    },
  };

  await fs.writeFile(
    path.join(exportsDirPath, "pipelineSummary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  console.log("Zapisano pliki exportu:");
  console.log("- exports/readyCompanies.csv");
  console.log("- exports/enrichCompanies.csv");
  console.log("- exports/pipelineSummary.json");

  console.log("\nPodsumowanie pipeline:");
  console.log(`allCompanies=${summary.counts.allCompanies}`);
  console.log(`readyCompanies=${summary.counts.readyCompanies}`);
  console.log(`enrichCompanies=${summary.counts.enrichCompanies}`);
  console.log(`skipCompanies=${summary.counts.skipCompanies}`);
  console.log(`allContacts=${summary.counts.allContacts}`);
}

async function main() {
  await ensureExportsDir();

  runCommand("import:apify");
  runCommand("promote:imports");
  runCommand("enrich:deWebsites");

  const pipelineData = await fetchPipelineData();

  await writeExportFiles(pipelineData);
}

main().catch((error) => {
  console.error("runFullPipeline nie udal sie:");
  console.error(error);
  process.exit(1);
});
