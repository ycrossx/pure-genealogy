import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/import-administrative-divisions.mjs <divisions.json>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const raw = await fs.readFile(inputPath, "utf8");
const rows = JSON.parse(raw);

if (!Array.isArray(rows)) {
  console.error("Input must be a JSON array.");
  process.exit(1);
}

const normalizedRows = rows.map((row, index) => ({
  code: String(row.code),
  name: String(row.name),
  level: String(row.level),
  parent_code: row.parent_code ? String(row.parent_code) : null,
  full_name: row.full_name ? String(row.full_name) : null,
  sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
}));

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

const batchSize = 1000;
for (let index = 0; index < normalizedRows.length; index += batchSize) {
  const batch = normalizedRows.slice(index, index + batchSize);
  const { error } = await supabase
    .from("administrative_divisions")
    .upsert(batch, { onConflict: "code" });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Imported ${Math.min(index + batch.length, normalizedRows.length)} / ${normalizedRows.length}`);
}

console.log("Administrative divisions import complete.");
