const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(process.env.PLAYLIST_PATH || path.join(__dirname, '..', 'playlist.m3u'));
const reportPath = path.resolve(process.env.REPORT_PATH || path.join(path.dirname(source), 'playlist-check.json'));
const timeoutMs = Number(process.env.CHECK_TIMEOUT_MS || 5000);
const concurrency = Number(process.env.CHECK_CONCURRENCY || 24);

function parsePlaylist(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXTINF')) continue;
    const info = lines[index];
    const comma = info.indexOf(',');
    const name = comma >= 0 ? info.slice(comma + 1).trim() : 'Canal';
    const group = info.match(/group-title="([^"]*)"/i)?.[1] || 'Sem categoria';
    let url = '';
    for (let next = index + 1; next < lines.length && !lines[next].startsWith('#EXTINF'); next += 1) {
      if (lines[next].trim() && !lines[next].startsWith('#')) { url = lines[next].trim(); break; }
    }
    if (url) entries.push({ index: entries.length + 1, name, group, url });
  }
  return entries;
}
async function check(entry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(entry.url, { method: 'GET', headers: { Range: 'bytes=0-1024', 'User-Agent': 'ListaForge-Checker/1.0' }, redirect: 'follow', signal: controller.signal });
    return { ...entry, status: response.status, ok: response.status >= 200 && response.status < 400, error: '' };
  } catch (error) {
    return { ...entry, status: 0, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.code || error.message }; 
  } finally { clearTimeout(timer); }
}
async function main() {
  const entries = parsePlaylist(fs.readFileSync(source, 'utf8'));
  console.log(`Testando ${entries.length} canais; timeout ${timeoutMs}ms; concorrência ${concurrency}`);
  const results = [];
  for (let start = 0; start < entries.length; start += concurrency) {
    const batch = entries.slice(start, start + concurrency);
    results.push(...await Promise.all(batch.map(check)));
    process.stdout.write(`\r${Math.min(start + concurrency, entries.length)}/${entries.length}`);
  }
  const report = { source, checkedAt: new Date().toISOString(), total: results.length, online: results.filter(item => item.ok).length, offline: results.filter(item => !item.ok).length, results };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write('\n');
  console.log(JSON.stringify({ total: report.total, online: report.online, offline: report.offline, report: reportPath }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
