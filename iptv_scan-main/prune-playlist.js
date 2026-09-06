const fs = require('node:fs');
const path = require('node:path');

const source = process.env.PLAYLIST_PATH ? path.resolve(process.env.PLAYLIST_PATH) : path.resolve(__dirname, '..', 'lista');
const backup = `${source}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const dryRun = !process.argv.includes('--apply');
const timeoutMs = Number(process.env.PRUNE_TIMEOUT_MS || 7000);
const brazilianWords = /\b(brasil|brasileir[ao]s?|sbt|globo|record|band|cultura|gazeta|redetv|tv brasil|tv camara|tv c[aâ]mara|tv senado|canal rural|tv aparecida|jovem pan|rede minas|tv bahia|tv cear[aá]|tv pernambuco|tv paran[aá]|tv amaz[oô]nia|tv pampa|tv tribuna|tv sergipe|tv morena|tv fronteira|tvdi[aá]rio|tvcidade)\b/i;

function normalize(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function readEntries(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXTINF')) continue;
    const info = lines[index];
    const comma = info.indexOf(',');
    const name = comma >= 0 ? info.slice(comma + 1).trim() : 'Canal';
    const idMatch = info.match(/tvg-id="([^"]*)"/i);
    const id = idMatch ? idMatch[1] : '';
    const groupMatch = info.match(/group-title="([^"]*)"/i);
    const group = groupMatch ? groupMatch[1] : '';
    let url = '';
    let next = index + 1;
    while (next < lines.length && !lines[next].startsWith('#EXTINF')) {
      if (lines[next].trim() && !lines[next].startsWith('#')) { url = lines[next].trim(); break; }
      next += 1;
    }
    if (url) entries.push({ info, name, id, group, url });
  }
  return entries;
}
function isBrazilian(entry) {
  const id = normalize(entry.id);
  const text = normalize(`${entry.name} ${entry.url}`);
  return /(?:\.br@|@br(?:$|[.@]))/.test(id) || brazilianWords.test(text) || /(?:\.com\.br|\.br\/)/i.test(entry.url);
}
function category(entry) {
  const current = entry.group;
  if (current && current.toLowerCase() !== 'undefined' && current.toLowerCase() !== 'sem categoria') return current;
  const name = normalize(entry.name);
  if (/\b(sbt|serie|novela|entretenimento|comedia|show)\b/.test(name)) return 'Entertainment';
  if (/\b(futebol|esporte|sports|sport|arena)\b/.test(name)) return 'Sports';
  if (/\b(news|noticia|jornal|news)\b/.test(name)) return 'News';
  if (/\b(relig|igreja|gospel|catolic|evangel)\b/.test(name)) return 'Religious';
  if (/\b(filme|movie|cinema)\b/.test(name)) return 'Movies';
  if (/\b(kids|infantil|famil|desenho|crianca)\b/.test(name)) return 'Familiares';
  return 'General';
}
function withCategory(entry) {
  const group = category(entry);
  return { ...entry, group, info: entry.info.replace(/group-title="[^"]*"/i, `group-title="${group}"`) };
}
async function works(entry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(entry.url, { headers: { Range: 'bytes=0-1024', 'User-Agent': 'ListaForge/1.0' }, redirect: 'follow', signal: controller.signal });
    return response.status >= 200 && response.status < 400;
  } catch { return false; } finally { clearTimeout(timer); }
}
async function main() {
  const entries = readEntries(fs.readFileSync(source, 'utf8'));
  const brazilian = entries.filter(isBrazilian).map(withCategory);
  console.log(`Entradas encontradas: ${entries.length}; candidatas brasileiras: ${brazilian.length}; timeout: ${timeoutMs}ms`);
  const results = [];
  const concurrency = 12;
  for (let start = 0; start < brazilian.length; start += concurrency) {
    const batch = brazilian.slice(start, start + concurrency);
    const batchResults = await Promise.all(batch.map(async entry => ({ entry, ok: await works(entry) })));
    results.push(...batchResults);
    process.stdout.write(`\rTestando ${Math.min(start + concurrency, brazilian.length)}/${brazilian.length} canais `);
  }
  const kept = results.filter(result => result.ok).map(result => result.entry);
  const removedForeign = entries.length - brazilian.length;
  const removedOffline = brazilian.length - kept.length;
  process.stdout.write('\n');
  const categories = Object.fromEntries([...new Set(kept.map(entry => entry.group))].sort().map(group => [group, kept.filter(entry => entry.group === group).length]));
  console.log(JSON.stringify({ total: entries.length, brazilian: brazilian.length, kept: kept.length, removedForeign, removedOffline, categories, dryRun }, null, 2));
  if (dryRun) return;
  fs.copyFileSync(source, backup);
  const output = ['#EXTM3U', ...kept.flatMap(entry => [entry.info, entry.url])].join('\n') + '\n';
  fs.writeFileSync(source, output, 'utf8');
  console.log(`Backup criado em ${backup}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });