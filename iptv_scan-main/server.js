const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const LIST_ROOT = process.env.LIST_DIR ? path.resolve(process.env.LIST_DIR) : path.resolve(ROOT, '..');
const DEFAULT_LIST = process.env.SOURCE_LIST || (fs.existsSync(path.join(LIST_ROOT, 'playlist.m3u')) ? 'playlist.m3u' : 'lista');
const SOURCE_LIST = path.isAbsolute(DEFAULT_LIST) ? DEFAULT_LIST : path.resolve(LIST_ROOT, DEFAULT_LIST);
const FILMS_LIST = path.resolve(LIST_ROOT, process.env.FILMS_LIST || 'filmes.m3u');
const DATA_DIR = path.join(ROOT, 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const REPORT_FILE = path.resolve(ROOT, '..', fs.existsSync(path.resolve(ROOT, '..', 'playlist-check-latest.json')) ? 'playlist-check-latest.json' : 'playlist-check.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || 'felipe';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUBSCRIPTIONS_FILE)) fs.writeFileSync(SUBSCRIPTIONS_FILE, '[]');

function readSubscriptions() { return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')); }
function saveSubscriptions(value) { fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(value, null, 2)); }
function displaySeparator(text) { let quoted = false; for (let index = 0; index < text.length; index += 1) { if (text[index] === '"') quoted = !quoted; else if (text[index] === ',' && !quoted) return index; } return -1; }
function parsePlaylist(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const channels = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXTINF')) continue;
    const info = lines[index];
    const comma = displaySeparator(info);
    const attrs = {};
    for (const match of info.slice(0, comma).matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
    let url = '';
    for (let next = index + 1; next < lines.length && !lines[next].startsWith('#EXTINF'); next += 1) {
      if (!lines[next].startsWith('#')) { url = lines[next]; break; }
    }
    if (url) {
      const name = comma > -1 ? info.slice(comma + 1).trim() : 'Canal';
      channels.push({ name, group: classifyGroup(name, attrs['group-title'], url), logo: attrs['tvg-logo'] || '', id: attrs['tvg-id'] || '', url });
    }
  }
  return channels;
}
function classifyGroup(name, currentGroup, url = '') {
  const group = String(currentGroup || '').trim();
  const primary = group.split(';')[0].trim();
  const normalized = `${String(name)} ${group} ${url}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const existing = { general: 'TV Geral', 'sem categoria': 'TV Geral', 'tv aberta': 'TV Aberta', aberta: 'TV Aberta', legislative: 'Publica', culture: 'Cultura', documentary: 'Documentarios', 'documentarios': 'Documentarios', lifestyle: 'Estilo de vida', outdoor: 'Natureza e Outdoor', cooking: 'Culinaria', animation: 'Animacao', kids: 'Infantil', music: 'Musica', religious: 'Religiosos', education: 'Educacao', travel: 'Viagens', sports: 'Esportes', entertainment: 'Entretenimento', news: 'Noticias', movies: 'Filmes', series: 'Series' };
  if (existing[normalizedValue(primary)]) return existing[normalizedValue(primary)];
  const rules = [
    ['Noticias', /\b(news|noticia|jornal|politica|economia|globo news|cnn|bandnews)\b/],
    ['Esportes', /\b(esporte|sport|sports|futebol|football|premiere|espn|combate|arena)\b/],
    ['Infantil', /\b(kids|infantil|crianca|desenho|cartoon|nick|disney|gloob|baby)\b/],
    ['Globo', /\b(globo|globoplay|sportv|multishow|gnt|viva|canal brasil)\b/],
    ['SBT', /\bsbt\b/],
    ['Record', /\b(record|record news|r7)\b/],
    ['Band', /\b(band|bandnews|bandsports)\b/],
    ['Musica', /\b(music|musica|musical|mtv|radio|fm|sertanejo|rock)\b/],
    ['Religiosos', /\b(relig|igreja|gospel|catolic|evangel|biblia|faith)\b/],
    ['Educacao', /\b(educa|school|univers|aula|ciencia|history|historia)\b/],
    ['Natureza e Outdoor', /\b(travel|turismo|viagem|aventura|outdoor|pesca|natureza)\b/],
    ['Culinaria', /\b(cooking|culinaria|receita|food|comida|chef)\b/],
    ['Entretenimento', /\b(entertainment|variedade|show|humor|comedia|celebridade)\b/]
  ];
  return rules.find(([, pattern]) => pattern.test(normalized))?.[0] || (primary && !['General', 'Sem categoria'].includes(primary) ? primary : 'TV Geral');
}
function normalizedValue(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function mediaKind(item) {
  const group = normalizedValue(item.group);
  const name = normalizedValue(item.name);
  const url = normalizedValue(item.url);
  if (group.startsWith('series') || /\/series\//.test(url)) return 'series';
  if (group.startsWith('filmes') || group === 'filme' || group === 'movies' || group === 'movie' || group === 'documentarios' || group === 'shop' || /\/movie\//.test(url)) return 'movie';
  if (/\bs\d{1,2}\s*e\d{1,2}\b/.test(name)) return 'series';
  if (/\.(mp4|mkv|avi)(\?|$)/.test(url)) return 'movie';
  return 'channel';
}
function movieGroup(group) {
  const value = String(group || '').trim();
  if (/^filmes\s*\|/i.test(value)) return value;
  if (normalizedValue(value) === 'documentarios') return 'Filmes | Documentarios';
  return `Filmes | ${value || 'Outros'}`;
}
function seriesGroup(group) {
  const value = String(group || '').trim();
  return /^series\s*\|/i.test(value) ? value : `Series | ${value || 'Outras Produtoras'}`;
}
function channels() {
  const parsed = parsePlaylist(fs.readFileSync(SOURCE_LIST, 'utf8')).filter(item => mediaKind(item) === 'channel');
  if (parsed.length) return parsed;
  if (fs.existsSync(REPORT_FILE)) {
    const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
    return (report.results || []).filter(item => item.ok && item.url).map(item => ({ name: item.name || 'Canal', group: item.group || 'Sem categoria', logo: '', id: '', url: item.url }));
  }
  return [];
}
function films() {
  if (!fs.existsSync(FILMS_LIST)) return [];
  return parsePlaylist(fs.readFileSync(FILMS_LIST, 'utf8')).filter(item => mediaKind(item) !== 'channel').map(item => ({ ...item, group: mediaKind(item) === 'series' ? seriesGroup(item.group) : movieGroup(item.group) }));
}
function playlistCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return (fs.readFileSync(filePath, 'utf8').match(/^#EXTINF/gm) || []).length;
}
function fileRevision(filePath) { if (!fs.existsSync(filePath)) return 'missing'; const stat = fs.statSync(filePath); return `${stat.size}-${stat.mtimeMs}`; }
function playlistText(includeVods = true) { const items = includeVods ? [...channels(), ...films()] : channels(); return ['#EXTM3U', ...items.flatMap(item => [`#EXTINF:-1 tvg-id="${item.id}" tvg-logo="${item.logo}" group-title="${item.group}",${item.name}`, item.url])].join('\n') + '\n'; }
function xtreamCategories(list) { return [...new Set(list.map(channel => channel.group || 'Sem categoria'))].map((category, index) => ({ category_id: String(index + 1), category_name: category, parent_id: 0 })); }
function xtreamStreams(list) { const categories = xtreamCategories(list); const categoryIds = new Map(categories.map(category => [category.category_name, category.category_id])); return list.map((channel, index) => ({ num: index + 1, name: channel.name, stream_type: 'live', stream_id: index + 1, stream_icon: channel.logo || '', epg_channel_id: channel.id || '', category_id: categoryIds.get(channel.group || 'Sem categoria'), tv_archive: 0, direct_source: channel.url, stream_url: channel.url, tvg_id: channel.id || '', tvg_name: channel.name, tvg_logo: channel.logo || '', group_title: channel.group || 'Sem categoria' })); }
function vodItems() { return films().filter(item => !/^Series\s*\|/i.test(item.group)); }
function seriesItems() { return films().filter(item => /^Series\s*\|/i.test(item.group)); }
function seriesCatalog() {
  const catalog = new Map();
  for (const [index, item] of seriesItems().entries()) {
    const episodeMatch = item.name.match(/^(.*?)(?:\s+S\d{1,2}\s*E\d{1,3}|\s+\d{1,2}x\d{1,3})\b/i);
    const name = (episodeMatch ? episodeMatch[1] : item.name).trim();
    const key = `${name.toLowerCase()}|${item.group}`;
    if (!catalog.has(key)) catalog.set(key, { ...item, name, series_id: catalog.size + 1, episodes: [] });
    catalog.get(key).episodes.push({ ...item, episode_num: catalog.get(key).episodes.length + 1, source_index: index + 1 });
  }
  return [...catalog.values()];
}
function xtreamVodStreams(list, type) { const categories = xtreamCategories(list); const categoryIds = new Map(categories.map(category => [category.category_name, category.category_id])); return list.map((item, index) => ({ num: index + 1, name: item.name, stream_type: type, stream_id: index + 1, series_id: type === 'series' ? index + 1 : undefined, stream_icon: item.logo || '', cover: item.logo || '', cover_big: item.logo || '', rating: '0', rating_5based: '0', category_id: categoryIds.get(item.group || 'Filmes'), category_ids: [Number(categoryIds.get(item.group || 'Filmes'))], container_extension: item.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'mp4', direct_source: item.url, stream_url: item.url, plot: '', cast: '', director: '', genre: item.group || 'Filmes', releaseDate: '', last_modified: '', tmdb_id: item.id || '' })); }
function findSubscription(username, password) { return readSubscriptions().find(item => item.username === username && item.password === password); }
function active(subscription) { return subscription && new Date(subscription.expiresAt).getTime() > Date.now(); }
function send(response, status, body, type = 'application/json') { const payload = type === 'application/json' ? JSON.stringify(body) : body; const headers = { 'Content-Type': type === 'audio/x-mpegurl' ? 'application/vnd.apple.mpegurl' : `${type}; charset=utf-8`, 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }; if (type === 'audio/x-mpegurl') headers['Content-Disposition'] = 'inline; filename="playlist.m3u"'; response.writeHead(status, headers); response.end(payload); }
function authorized(request) { return request.headers['x-admin-key'] === ADMIN_KEY; }
function body(request) { return new Promise((resolve, reject) => { let value = ''; request.on('data', chunk => value += chunk); request.on('end', () => { try { resolve(JSON.parse(value || '{}')); } catch { reject(new Error('JSON inválido')); } }); }); }

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }); return response.end(); }
  try {
    if (url.pathname === '/api/subscriptions' && request.method === 'POST') {
      if (!authorized(request)) return send(response, 401, { error: 'Não autorizado' });
      const input = await body(request);
      if (!input.name || !input.username || !input.password || !Number(input.days)) return send(response, 400, { error: 'Nome, usuário, senha e dias são obrigatórios.' });
      const subscriptions = readSubscriptions();
      if (subscriptions.some(item => item.username === input.username)) return send(response, 409, { error: 'Este usuário já existe.' });
      const expiresAt = new Date(Date.now() + Number(input.days) * 86400000).toISOString();
      const subscription = { id: crypto.randomUUID(), name: input.name, username: input.username, password: input.password, expiresAt, createdAt: new Date().toISOString() };
      subscriptions.push(subscription); saveSubscriptions(subscriptions);
      return send(response, 201, { ...subscription, channels: channels().length, baseUrl: PUBLIC_URL || `http://${request.headers.host}` });
    }
    if (url.pathname === '/api/subscriptions' && request.method === 'GET') {
      if (!authorized(request)) return send(response, 401, { error: 'Não autorizado' });
      return send(response, 200, readSubscriptions().map(item => ({ ...item, active: active(item) })));
    }
    if (url.pathname.startsWith('/api/subscriptions/') && request.method === 'DELETE') {
      if (!authorized(request)) return send(response, 401, { error: 'Não autorizado' });
      const id = url.pathname.split('/').pop();
      const subscriptions = readSubscriptions();
      const next = subscriptions.filter(item => item.id !== id);
      if (next.length === subscriptions.length) return send(response, 404, { error: 'Assinatura não encontrada.' });
      saveSubscriptions(next);
      return send(response, 200, { ok: true });
    }
    if (url.pathname === '/get.php') {
      const token = url.searchParams.get('token');
      const subscription = token ? readSubscriptions().find(item => item.id === token) : findSubscription(url.searchParams.get('username'), url.searchParams.get('password'));
      if (!active(subscription)) return send(response, 403, '# Playlist expirada\n', 'audio/x-mpegurl');
      return send(response, 200, playlistText(url.searchParams.get('type') !== 'live'), 'audio/x-mpegurl');
    }
    if (url.pathname === '/player_api.php') {
      const subscription = findSubscription(url.searchParams.get('username'), url.searchParams.get('password'));
      if (!active(subscription)) return send(response, 403, { user_info: { status: 'Expired' } });
      const sourceChannels = channels();
      const action = url.searchParams.get('action');
      if (action === 'get_live_categories') return send(response, 200, xtreamCategories(sourceChannels));
      if (action === 'get_live_streams' || action === 'get_live_streams_by_category') return send(response, 200, xtreamStreams(sourceChannels));
      if (action === 'get_vod_categories') return send(response, 200, xtreamCategories(vodItems()));
      if (action === 'get_vod_streams' || action === 'get_vod_streams_by_category') return send(response, 200, xtreamVodStreams(vodItems(), 'movie'));
      if (action === 'get_series_categories') return send(response, 200, xtreamCategories(seriesCatalog()));
      if (action === 'get_series') return send(response, 200, xtreamVodStreams(seriesCatalog(), 'series'));
      if (action === 'get_vod_info') { const item = vodItems()[Number(url.searchParams.get('vod_id')) - 1]; return send(response, 200, item ? { info: { name: item.name, movie_image: item.logo || '', plot: '', genre: item.group || 'Filmes' }, movie_data: { stream_id: Number(url.searchParams.get('vod_id')), name: item.name, container_extension: 'mp4' } } : {}); }
      if (action === 'get_series_info') { const seriesId = Number(url.searchParams.get('series_id')); const item = seriesCatalog()[seriesId - 1]; return send(response, 200, item ? { info: { name: item.name, cover: item.logo || '', cover_big: item.logo || '', plot: '', cast: '', director: '', genre: item.group || 'Series', rating: '0', rating_5based: '0', releaseDate: '' }, episodes: { '1': item.episodes.map((episode, index) => ({ id: episode.source_index, episode_num: index + 1, season: 1, title: episode.name, container_extension: 'mp4', info: { movie_image: episode.logo || '', plot: '' }, direct_source: episode.url })) } } : {}); }
      const serverUrl = PUBLIC_URL || `http://${request.headers.host}`;
      const parsedServerUrl = new URL(serverUrl);
      const defaultPort = parsedServerUrl.protocol === 'https:' ? '443' : '80';
      const publicPort = parsedServerUrl.port || defaultPort;
      return send(response, 200, { user_info: { username: subscription.username, password: subscription.password, status: 'Active', exp_date: Math.floor(new Date(subscription.expiresAt).getTime() / 1000), is_trial: '0', active_cons: '0', max_connections: '1' }, server_info: { url: serverUrl, port: publicPort, https_port: parsedServerUrl.protocol === 'https:' ? publicPort : '443', server_protocol: parsedServerUrl.protocol === 'https:' ? 'https' : 'http' } });
    }
    if (url.pathname.startsWith('/live/')) {
      const parts = url.pathname.split('/');
      const subscription = findSubscription(parts[2], parts[3]);
      const streamId = Number((parts[4] || '').replace(/\.(ts|m3u8)$/i, ''));
      const stream = active(subscription) && channels()[streamId - 1];
      if (!stream) return send(response, 404, { error: 'Canal não encontrado' });
      response.writeHead(302, { Location: stream.url, 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (url.pathname.startsWith('/movie/') || url.pathname.startsWith('/series/')) {
      const parts = url.pathname.split('/');
      const subscription = findSubscription(parts[2], parts[3]);
      const collection = url.pathname.startsWith('/movie/') ? vodItems() : seriesCatalog().flatMap(item => item.episodes);
      const streamId = Number((parts[4] || '').replace(/\.[a-z0-9]+$/i, ''));
      const stream = active(subscription) && collection[streamId - 1];
      if (!stream) return send(response, 404, { error: 'Conteúdo não encontrado' });
      response.writeHead(302, { Location: stream.url, 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (url.pathname === '/health') return send(response, 200, { ok: true, channels: channels().length, time: new Date().toISOString() });
    if (url.pathname === '/api/catalog' && request.method === 'GET') {
      const list = url.searchParams.get('list');
      if (list === 'meta') return send(response, 200, { channelsCount: playlistCount(SOURCE_LIST), filmsCount: playlistCount(FILMS_LIST), channelsRevision: fileRevision(SOURCE_LIST), filmsRevision: fileRevision(FILMS_LIST) });
      const sourceChannels = list === 'films' ? [] : channels();
      const sourceFilms = list === 'channels' ? [] : films();
      return send(response, 200, { channels: sourceChannels, films: sourceFilms, channelsCount: playlistCount(SOURCE_LIST), filmsCount: playlistCount(FILMS_LIST), channelsRevision: fileRevision(SOURCE_LIST), filmsRevision: fileRevision(FILMS_LIST), source: path.basename(SOURCE_LIST), filmsSource: path.basename(FILMS_LIST) });
    }
    if (url.pathname === '/playlist.m3u') {
      const token = url.searchParams.get('token');
      const subscription = token
        ? readSubscriptions().find(item => item.id === token)
        : findSubscription(url.searchParams.get('username'), url.searchParams.get('password'));
      if (!active(subscription)) return send(response, 403, '# Playlist expirada\n', 'audio/x-mpegurl');
      return send(response, 200, playlistText(url.searchParams.get('type') !== 'live'), 'audio/x-mpegurl');
    }
    const filePath = url.pathname === '/admin' || url.pathname === '/admin/' ? path.join(ROOT, 'admin.html') : path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (filePath.startsWith(ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      return send(response, 200, fs.readFileSync(filePath), types[ext] || 'application/octet-stream');
    }
    send(response, 404, { error: 'Não encontrado' });
  } catch (error) { send(response, 500, { error: error.message }); }
});
server.listen(PORT, HOST, () => console.log(`ListaForge online em ${PUBLIC_URL || `http://localhost:${PORT}`}`));
