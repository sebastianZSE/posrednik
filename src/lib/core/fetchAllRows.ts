// Pobiera WSZYSTKIE wiersze zapytania porcjami po 1000, omijając limit
// pojedynczego zapytania Supabase (domyślnie 5000 wierszy w tym projekcie).
//
// Użycie: przekaż funkcję budującą ŚWIEŻE zapytanie (z filtrami i sortowaniem);
// helper sam dołoży .range() dla kolejnych porcji.
//
// UWAGA: sortowanie w zapytaniu musi być deterministyczne (np. z tie-breakerem
// .order("id")), inaczej wiersze mogą się powtórzyć lub zgubić między porcjami.

const BATCH_SIZE = 1000;
const MAX_BATCHES = 200; // bezpiecznik: max 200 000 wierszy

type RangeResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

type RangeableQuery<T> = {
  range: (from: number, to: number) => RangeResult<T>;
};

export async function fetchAllRows<T>(
  buildQuery: () => RangeableQuery<T>,
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const rows: T[] = [];

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex++) {
    const from = batchIndex * BATCH_SIZE;
    const { data, error } = await buildQuery().range(from, from + BATCH_SIZE - 1);

    if (error) {
      return { rows: [], error };
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < BATCH_SIZE) {
      return { rows, error: null };
    }
  }

  return {
    rows: [],
    error: {
      message: `fetchAllRows: przekroczono limit ${MAX_BATCHES * BATCH_SIZE} wierszy`,
    },
  };
}
