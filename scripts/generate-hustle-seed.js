/**
 * Writes the 15 hustles from src/data/hustles.seed.json into the SQL
 * migration, between the "BEGIN HUSTLE SEED" / "END HUSTLE SEED" markers.
 * Run after editing the JSON:  npm run seed:hustles
 */
const fs = require('fs');
const path = require('path');

// Run from the project folder (npm run seed:hustles does this).
const root = process.cwd();
const hustles = require(path.join(root, 'src/data/hustles.seed.json'));
const migrationsDir = path.join(root, 'supabase/migrations');
const file = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => path.join(migrationsDir, f))
  .find((f) => fs.readFileSync(f, 'utf8').includes('-- BEGIN HUSTLE SEED'));

if (!file) {
  console.error('No migration with "-- BEGIN HUSTLE SEED" marker found.');
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const columns = [
  'slug', 'name_en', 'name_pl', 'summary_en', 'summary_pl',
  'hours_per_week_min', 'hours_per_week_max', 'startup_cost_min', 'startup_cost_max',
  'earning_range_en', 'earning_range_pl', 'earning_min_usd', 'earning_max_usd', 'difficulty', 'icon',
];
const numeric = new Set([
  'hours_per_week_min', 'hours_per_week_max', 'startup_cost_min', 'startup_cost_max',
  'earning_min_usd', 'earning_max_usd', 'difficulty',
]);

const rows = hustles.map((h) => {
  for (const c of columns) {
    if (h[c] === undefined) throw new Error(`Hustle "${h.slug}" is missing "${c}"`);
  }
  return '  (' + columns.map((c) => (numeric.has(c) ? Number(h[c]) : q(h[c]))).join(', ') + ')';
});

const sql = [
  `insert into public.hustles (${columns.join(', ')}) values`,
  rows.join(',\n'),
  'on conflict (slug) do update set',
  columns
    .filter((c) => c !== 'slug')
    .map((c) => `  ${c} = excluded.${c}`)
    .join(',\n') + ';',
].join('\n');

const text = fs.readFileSync(file, 'utf8');
const begin = text.indexOf('-- BEGIN HUSTLE SEED');
const beginLineEnd = text.indexOf('\n', begin) + 1;
const end = text.indexOf('-- END HUSTLE SEED');
const out = text.slice(0, beginLineEnd) + sql + '\n' + text.slice(end);
fs.writeFileSync(file, out, 'utf8');
console.log(`Wrote ${hustles.length} hustles into ${path.relative(root, file)}`);
