const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportPath = path.resolve(process.env.REPORT_PATH || path.join(root, 'playlist-check-latest.json'));
const outputPath = path.resolve(process.env.PLAYLIST_PATH || path.join(root, 'playlist.m3u'));
const backupPath = `${outputPath}.before-active`;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const active = report.results.filter(item => item.ok && item.url);
const quote = value => String(value || '').replace(/"/g, '&quot;');
const lines = ['#EXTM3U'];
for (const item of active) {
  lines.push(`#EXTINF:-1 tvg-id="" tvg-logo="" group-title="${quote(item.group || 'Sem categoria')}",${item.name || 'Canal'}`);
  lines.push(item.url);
}
if (fs.existsSync(outputPath)) fs.copyFileSync(outputPath, backupPath);
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ report: reportPath, output: outputPath, backup: backupPath, active: active.length }, null, 2));
