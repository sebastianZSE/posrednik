// config({ path: ".env.local" })

// ładujemy env tu, a nie w skrypcie, żeby import modułu był bezpieczny.

// createClient(...)

// tworzymy jeden wspólny admin client dla skryptów pipeline.

// throw new Error(...)

// zostawiamy jawne błędy, bo przy skryptach CLI chcesz od razu widzieć, czego brakuje.


import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL w .env.local");
}

if (!serviceRoleKey) {
  throw new Error("Brakuje SUPABASE_SERVICE_ROLE_KEY w .env.local");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);