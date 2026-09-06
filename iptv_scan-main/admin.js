const form = document.querySelector('#subscriptionForm');
const result = document.querySelector('#result');
const list = document.querySelector('#subscriptionList');
const keyValue = () => form.elements.adminKey.value.trim();
const apiUrl = path => new URL(path, window.location.origin).href;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function readResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!contentType.includes('application/json')) {
    throw new Error(`A API respondeu HTML em ${response.url}. Abra o painel por http://localhost:3000/admin.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('A API retornou uma resposta JSON inválida.');
  }
}

async function loadSubscriptions() {
  if (location.protocol === 'file:') {
    list.innerHTML = '<p class="hint">Abra o painel por http://localhost:3000/admin.</p>';
    return;
  }
  const key = keyValue();
  if (!key) {
    list.innerHTML = '<p class="hint">Informe a chave administrativa primeiro.</p>';
    return;
  }
  try {
    const response = await fetch(apiUrl('/api/subscriptions'), { headers: { 'x-admin-key': key }, cache: 'no-store' });
    const values = await readResponse(response);
    if (!response.ok) throw new Error(values.error || 'Chave administrativa inválida.');
    if (!values.length) {
      list.innerHTML = '<p class="hint">Nenhuma assinatura cadastrada.</p>';
      return;
    }
    list.innerHTML = values.map(value => `<article class="subscription-item"><div><strong>${escapeHtml(value.name)}</strong><span>${escapeHtml(value.username)} · vence em ${new Date(value.expiresAt).toLocaleDateString('pt-BR')}</span></div><b class="${value.active ? 'active' : 'expired'}">${value.active ? 'ATIVA' : 'EXPIRADA'}</b><button class="icon-button revoke" data-id="${value.id}" title="Revogar">×</button></article>`).join('');
    list.querySelectorAll('.revoke').forEach(button => button.onclick = () => revokeSubscription(button.dataset.id));
  } catch (error) {
    list.innerHTML = `<p class="hint error-text">${escapeHtml(error.message)}</p>`;
  }
}

async function revokeSubscription(id) {
  if (!confirm('Revogar esta assinatura?')) return;
  try {
    const response = await fetch(apiUrl(`/api/subscriptions/${id}`), { method: 'DELETE', headers: { 'x-admin-key': keyValue() } });
    const value = await readResponse(response);
    if (!response.ok) throw new Error(value.error || 'Não foi possível revogar.');
    loadSubscriptions();
  } catch (error) {
    alert(error.message);
  }
}

form.onsubmit = async event => {
  event.preventDefault();
  if (location.protocol === 'file:') {
    result.hidden = false;
    result.className = 'result error';
    result.textContent = 'Abra o painel pelo endereço http://localhost:3000/admin depois de iniciar o servidor.';
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  const key = data.adminKey;
  delete data.adminKey;
  data.days = Number(data.days);
  try {
    const response = await fetch(apiUrl('/api/subscriptions'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(data) });
    const value = await readResponse(response);
    if (!response.ok) throw new Error(value.error || 'Não foi possível criar o acesso.');
    const base = window.location.origin;
    const m3uUrl = `${base}/get.php?username=${encodeURIComponent(value.username)}&password=${encodeURIComponent(value.password)}`;
    result.hidden = false;
    result.className = 'result';
    result.innerHTML = `<p class="section-label">ACESSO GERADO</p><strong>${escapeHtml(value.name)}</strong><p>Vencimento: ${new Date(value.expiresAt).toLocaleString('pt-BR')}</p><label>Link M3U compatível<input readonly value="${m3uUrl}"></label><p class="hint">Xtream Codes: servidor <b>${base}</b> | usuário <b>${escapeHtml(value.username)}</b> | senha <b>${escapeHtml(value.password)}</b></p><p class="hint">O servidor precisa estar online e acessível pela internet.</p>`;
    form.reset();
    form.elements.days.value = 30;
    loadSubscriptions();
  } catch (error) {
    result.hidden = false;
    result.textContent = error.message;
    result.className = 'result error';
  }
};

document.querySelector('#refreshButton').onclick = loadSubscriptions;
