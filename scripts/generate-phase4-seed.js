/**
 * Checks the 15 bilingual roadmaps in src/data/roadmaps and writes the
 * Phase 4 seed (approved base roadmaps in EN + PL, daily messages) into
 * supabase/migrations/20260929120100_phase4_seed.sql.
 *
 *   npm run seed:phase4        → check + write the SQL
 *   npm run check:roadmaps     → check only
 *
 * Affiliate links: paste yours into src/data/roadmaps/affiliate-links.json,
 * then run `npm run seed:phase4` again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ROADMAP_DIR = path.join(ROOT, 'src', 'data', 'roadmaps');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '20260929120100_phase4_seed.sql');
const BEGIN = '-- BEGIN PHASE 4 SEED';
const END = '-- END PHASE 4 SEED';
const LOCALES = ['en', 'pl'];
const checkOnly = process.argv.includes('--check');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hustles = readJson(path.join(ROOT, 'src', 'data', 'hustles.seed.json'));
const metricKeys = readJson(path.join(ROOT, 'src', 'data', 'metricKeys.json'));
const affiliateLinks = readJson(path.join(ROADMAP_DIR, 'affiliate-links.json')).links;
const messages = readJson(path.join(ROOT, 'src', 'data', 'dailyMessages.json'));

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isL10n = (v) => v && isText(v.en) && isText(v.pl);
const isHttps = (url) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Same logic as localizeRoadmap() in src/lib/roadmap.ts. */
function localize(src, locale) {
  const pick = (v) => v[locale];
  return {
    hustle_slug: src.hustle_slug,
    locale,
    total_weeks: src.total_weeks,
    phases: src.phases.map((p) => ({
      id: p.id,
      title: pick(p.title),
      goal: pick(p.goal),
      weeks: p.weeks,
      steps: p.steps.map((s) => ({
        id: s.id,
        title: pick(s.title),
        why: pick(s.why),
        instructions: s.instructions[locale],
        est_minutes: s.est_minutes,
        resources: s.resources.map((r) => ({ title: pick(r.title), url: r.url })),
        tools: s.tools.map((t) => {
          const link = (affiliateLinks[t.name] || '').trim();
          return link ? { name: t.name, url: link, affiliate: true } : { name: t.name, url: t.url, affiliate: Boolean(t.affiliate) };
        }),
        xp: s.xp,
        metric_to_track: pick(s.metric_to_track),
      })),
    })),
    weekly_metrics: src.weekly_metrics,
    earning_milestones: src.earning_milestones.map((m) => ({ label: pick(m.label), range: pick(m.range), note: pick(m.note) })),
  };
}

function validate(src, file) {
  const where = path.basename(file);
  const slug = path.basename(file, '.json');
  if (src.hustle_slug !== slug) fail(where, `hustle_slug "${src.hustle_slug}" must match the file name`);
  if (!hustles.some((h) => h.slug === src.hustle_slug)) fail(where, `unknown hustle "${src.hustle_slug}"`);
  if (!isInt(src.total_weeks, 1, 104)) fail(where, 'total_weeks must be a whole number');
  if (!Array.isArray(src.weekly_metrics) || src.weekly_metrics.length === 0) fail(where, 'weekly_metrics is empty');
  for (const key of src.weekly_metrics || []) {
    if (!metricKeys.includes(key)) fail(where, `weekly metric "${key}" is not in src/data/metricKeys.json`);
  }
  if (!Array.isArray(src.phases) || src.phases.length === 0) fail(where, 'no phases');

  const stepIds = new Set();
  (src.phases || []).forEach((phase, pi) => {
    const pw = `${where} ${phase.id || `phase #${pi + 1}`}`;
    if (phase.id !== `p${pi + 1}`) fail(pw, `phase id should be "p${pi + 1}"`);
    if (!/^\d+(-\d+)?$/.test(phase.weeks || '')) fail(pw, 'weeks must look like "1-2"');
    if (!isL10n(phase.title)) fail(pw, 'title needs en + pl');
    if (!isL10n(phase.goal)) fail(pw, 'goal needs en + pl');
    if (!Array.isArray(phase.steps) || phase.steps.length === 0) fail(pw, 'no steps');
    (phase.steps || []).forEach((step, si) => {
      const sw = `${where} ${step.id || `step #${si + 1}`}`;
      if (step.id !== `${phase.id}s${si + 1}`) fail(sw, `step id should be "${phase.id}s${si + 1}"`);
      if (stepIds.has(step.id)) fail(sw, 'duplicate step id');
      stepIds.add(step.id);
      if (!isInt(step.xp, 5, 500)) fail(sw, 'xp must be 5–500');
      if (!isInt(step.est_minutes, 5, 1440)) fail(sw, 'est_minutes must be 5–1440');
      for (const field of ['title', 'why', 'metric_to_track']) {
        if (!isL10n(step[field])) fail(sw, `${field} needs en + pl`);
      }
      const ins = step.instructions || {};
      if (!Array.isArray(ins.en) || !Array.isArray(ins.pl) || ins.en.length === 0) fail(sw, 'instructions need en + pl lists');
      else if (ins.en.length !== ins.pl.length) fail(sw, `instructions: ${ins.en.length} in English but ${ins.pl.length} in Polish`);
      else if (![...ins.en, ...ins.pl].every(isText)) fail(sw, 'an instruction is empty');
      for (const r of step.resources || []) {
        if (!isL10n(r.title)) fail(sw, 'resource title needs en + pl');
        if (!isHttps(r.url)) fail(sw, `resource url must start with https:// (${r.url})`);
      }
      for (const t of step.tools || []) {
        if (!isText(t.name)) fail(sw, 'tool without a name');
        if (!isHttps(t.url)) fail(sw, `tool url must start with https:// (${t.url})`);
        if (typeof t.affiliate !== 'boolean') fail(sw, `tool "${t.name}" needs affiliate: true/false`);
        if (!(t.name in affiliateLinks)) fail(sw, `tool "${t.name}" is missing from affiliate-links.json`);
      }
    });
  });

  if (!Array.isArray(src.earning_milestones) || src.earning_milestones.length === 0) fail(where, 'no earning_milestones');
  for (const m of src.earning_milestones || []) {
    if (!isL10n(m.label) || !isL10n(m.range) || !isL10n(m.note)) fail(where, 'earning milestone needs label, range and note in en + pl');
  }
}

// --- Roadmaps ---
const files = fs
  .readdirSync(ROADMAP_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'affiliate-links.json')
  .sort();

const sources = files.map((f) => {
  const file = path.join(ROADMAP_DIR, f);
  const src = readJson(file);
  validate(src, file);
  return src;
});

for (const h of hustles) {
  if (!sources.some((s) => s.hustle_slug === h.slug)) fail('roadmaps', `missing roadmap for hustle "${h.slug}"`);
}
for (const [name, link] of Object.entries(affiliateLinks)) {
  if (link && !isHttps(link)) fail('affiliate-links.json', `link for "${name}" must start with https://`);
}

// --- Daily messages ---
if (!Array.isArray(messages.en) || !Array.isArray(messages.pl) || messages.en.length !== messages.pl.length) {
  fail('dailyMessages.json', 'needs the same number of messages in en and pl');
}

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

const stepCount = sources.reduce((n, s) => n + s.phases.reduce((m, p) => m + p.steps.length, 0), 0);
console.log(`Roadmaps OK: ${sources.length} hustles, ${stepCount} steps, English + Polish.`);
if (checkOnly) process.exit(0);

// --- SQL ---
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
const TAG = '$roadmap$';

const roadmapRows = [];
for (const src of sources) {
  for (const locale of LOCALES) {
    const json = JSON.stringify(localize(src, locale));
    if (json.includes(TAG)) throw new Error(`${src.hustle_slug}: content contains ${TAG}`);
    roadmapRows.push(`  (${sqlText(src.hustle_slug)}, '${locale}', ${TAG}${json}${TAG})`);
  }
}

const messageRows = [];
for (const locale of LOCALES) {
  for (const text of messages[locale]) messageRows.push(`  ('${locale}', ${sqlText(text)})`);
}

const seed = [
  BEGIN,
  'insert into public.roadmaps (hustle_id, locale, version, status, content)',
  "select h.id, v.locale, 1, 'approved', v.content::jsonb",
  'from (values',
  roadmapRows.join(',\n'),
  ') as v(slug, locale, content)',
  'join public.hustles h on h.slug = v.slug',
  'on conflict (hustle_id, locale, version) do update',
  '  set content = excluded.content, status = excluded.status;',
  '',
  'insert into public.daily_messages (locale, text)',
  'select v.locale, v.text',
  'from (values',
  messageRows.join(',\n'),
  ') as v(locale, text)',
  'where not exists (select 1 from public.daily_messages d where d.locale = v.locale and d.text = v.text);',
  END,
].join('\n');

const sql = fs.readFileSync(MIGRATION, 'utf8');
const start = sql.indexOf(BEGIN);
const end = sql.indexOf(END);
if (start === -1 || end === -1) throw new Error(`Markers not found in ${MIGRATION}`);
fs.writeFileSync(MIGRATION, sql.slice(0, start) + seed + sql.slice(end + END.length));
console.log(`Wrote ${roadmapRows.length} roadmaps and ${messageRows.length} daily messages into ${path.relative(ROOT, MIGRATION)}.`);
