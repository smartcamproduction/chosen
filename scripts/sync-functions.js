/**
 * Copies the shared code into every Edge Function between its markers, so
 * each function is one self-contained file you can paste into the Supabase
 * dashboard:
 *   supabase/functions/_shared/chosen.ts    → the 5 AI functions
 *   supabase/functions/_shared/purchases.ts → the 2 purchase functions
 *
 *   npm run sync:functions            → update the functions
 *   npm run sync:functions -- --check → only check they're up to date
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), 'supabase', 'functions');
const GROUPS = [
  {
    shared: 'chosen.ts',
    begin: '// ===== BEGIN SHARED',
    end: '// ===== END SHARED =====',
    functions: ['coach-chat', 'checkin-feedback', 'personalize-roadmap', 'generate-roadmap', 'daily-motivation'],
  },
  {
    shared: 'purchases.ts',
    begin: '// ===== BEGIN PURCHASES SHARED',
    end: '// ===== END PURCHASES SHARED =====',
    functions: ['revenuecat-webhook', 'sync-purchases'],
  },
];
const check = process.argv.includes('--check');

let stale = 0;
let total = 0;

for (const group of GROUPS) {
  const shared = fs.readFileSync(path.join(DIR, '_shared', group.shared), 'utf8').replace(/\r\n/g, '\n').trim();
  for (const name of group.functions) {
    total += 1;
    const file = path.join(DIR, name, 'index.ts');
    const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const start = src.indexOf(group.begin);
    const end = src.indexOf(group.end);
    if (start === -1 || end === -1) throw new Error(`${name}: markers for ${group.shared} not found`);
    const beginLine = src.slice(start, src.indexOf('\n', start));
    const next = `${src.slice(0, start)}${beginLine}\n${shared}\n${src.slice(end)}`;
    if (next === src) continue;
    stale += 1;
    if (check) console.error(`${name} is out of date`);
    else {
      fs.writeFileSync(file, next);
      console.log(`updated ${name}`);
    }
  }
}

if (check && stale) {
  console.error('Run: npm run sync:functions');
  process.exit(1);
}
console.log(check ? 'Functions are in sync.' : `Done (${total - stale} already up to date).`);
