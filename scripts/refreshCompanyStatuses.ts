import { supabaseAdmin as supabase } from "../src/lib/core/supabaseAdmin";
import { refreshCompanyStatusAndQuality } from "../src/lib/core/companyStatus";

type CompanyRow = {
  id: string;
};

const READ_BATCH_SIZE = 500;
const UPDATE_CONCURRENCY = 50;

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function main() {
  let offset = 0;
  let processedCount = 0;

  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .order("created_at", { ascending: true })
      .range(offset, offset + READ_BATCH_SIZE - 1);

    if (error) {
      throw new Error(`Blad przy pobieraniu companies: ${error.message}`);
    }

    const companies = (data ?? []) as CompanyRow[];

    if (companies.length === 0) {
      break;
    }

    for (const chunk of chunkArray(companies, UPDATE_CONCURRENCY)) {
      await Promise.all(
        chunk.map((company) => refreshCompanyStatusAndQuality(company.id)),
      );
    }

    processedCount += companies.length;
    offset += READ_BATCH_SIZE;

    console.log(`[BATCH] offset=${offset} processedCount=${processedCount}`);
  }

  console.log("Refresh company statuses zakonczony.");
  console.log(`processedCount=${processedCount}`);
}

main().catch((error) => {
  console.error("Skrypt refreshCompanyStatuses nie udal sie:");
  console.error(error);
  process.exit(1);
});
