/**
 * Checks that English and Polish translation files contain the same keys.
 * Run with: npm run check:i18n
 *
 * Plural suffixes (_one, _few, _many, _other…) are treated as one key,
 * because Polish needs more plural forms than English.
 */
const en = require('../src/i18n/locales/en.json');
const pl = require('../src/i18n/locales/pl.json');

const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out.add(path.replace(PLURAL, ''));
  }
  return out;
}

const enKeys = flatten(en);
const plKeys = flatten(pl);
const missingInPl = [...enKeys].filter((k) => !plKeys.has(k));
const missingInEn = [...plKeys].filter((k) => !enKeys.has(k));

if (missingInPl.length || missingInEn.length) {
  if (missingInPl.length) console.error('Missing in pl.json:\n  ' + missingInPl.join('\n  '));
  if (missingInEn.length) console.error('Missing in en.json:\n  ' + missingInEn.join('\n  '));
  process.exit(1);
}
console.log(`Translations OK: ${enKeys.size} keys in both English and Polish.`);
