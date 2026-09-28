/**
 * Opens every resource and tool link in the roadmaps and reports the ones
 * that don't load. Some sites block automated checks (status 403/429);
 * open those in a browser to confirm.
 *
 *   npm run check:links
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), 'src', 'data', 'roadmaps');
const urls = new Set();
for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.json') || file === 'affiliate-links.json') continue;
  const src = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  for (const phase of src.phases) {
    for (const step of phase.steps) {
      for (const r of step.resources) urls.add(r.url);
      for (const t of step.tools) urls.add(t.url);
    }
  }
}

async function check(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (link check)', Accept: 'text/html' },
    });
    return { url, status: res.status, final: res.url };
  } catch (e) {
    return { url, status: 0, final: String(e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const results = await Promise.all([...urls].sort().map(check));
  let bad = 0;
  for (const r of results) {
    const ok = r.status >= 200 && r.status < 400;
    if (!ok) bad += 1;
    console.log(`${ok ? 'OK ' : 'CHECK'} ${String(r.status).padStart(3)}  ${r.url}${r.final && r.final !== r.url ? `  →  ${r.final}` : ''}`);
  }
  console.log(`\n${results.length} links, ${bad} to check by hand.`);
})();
