const SECTION_NAMES = {
  home: 'VISÃO GERAL',
  voice: 'MINHA VOZ',
  library: 'BIBLIOTECA',
  calendar: 'AGENDA',
  settings: 'CONEXÕES',
};

let appState = null;
let currentPostId = null;
let toastTimeout = null;
let draftAutosaveTimer = null;
let draftAutosaveInFlight = null;
let draftAutosaveDirty = false;
let draftAutosaveFailed = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não consegui concluir agora. Tente novamente.');
  return data;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3600);
}

function showView(name) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `${name}-view`));
  $$('.nav-item').forEach((item) => {
    const active = item.dataset.view === name;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $('#current-section').textContent = SECTION_NAMES[name] || SECTION_NAMES.home;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (appState && (name === 'home' || name === 'calendar' || name === 'settings')) {
    void refreshLiveState();
  }
}

function setDefaultSchedule() {
  const timezone = appState?.timezone || 'America/Fortaleza';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const tomorrow = new Date(Date.UTC(values.year, values.month - 1, values.day + 1));
  $('#schedule-at').value = `${tomorrow.toISOString().slice(0, 10)}T10:00`;
  $('#schedule-at').min = formatDateTimeLocal(new Date(), timezone);
}

function formatDateTimeLocal(date, timezone = appState?.timezone || 'America/Fortaleza') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function toDateTimeLocal(isoValue) {
  if (!isoValue) return '';
  return formatDateTimeLocal(new Date(isoValue));
}

function displayDate(isoValue) {
  if (!isoValue) return 'Sem data';
  const date = new Date(isoValue);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: appState?.timezone || 'America/Fortaleza', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function statusLabel(status) {
  return ({
    draft: 'Rascunho',
    scheduled: 'Agendado',
    publishing: 'Publicando',
    published: 'Publicado',
    failed: 'Precisa de atenção',
    uncertain: 'Confira no LinkedIn',
  })[status] || status;
}

function postCard(post, full = false) {
  const when = post.status === 'published' ? displayDate(post.published_at) : displayDate(post.scheduled_at || post.created_at);
  let actions = '';
  if (post.status === 'uncertain') {
    actions = `<div class="post-row-actions"><a href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer">Abrir LinkedIn</a><button data-publish-post="${escapeHTML(post.id)}" data-uncertain="true">Conferi; tentar novamente</button></div>`;
  } else if (post.status !== 'published' && post.status !== 'publishing') {
    actions = `<div class="post-row-actions"><button data-edit-post="${escapeHTML(post.id)}">Abrir rascunho</button>${post.status === 'failed' ? `<button data-publish-post="${escapeHTML(post.id)}">Tentar publicar</button>` : ''}</div>`;
  }
  const status = `<span class="post-status">${escapeHTML(statusLabel(post.status))}</span>`;
  const content = `<div class="post-row-main"><h3 class="post-row-title">${escapeHTML(post.topic || 'Post sem título')}</h3><p class="post-row-preview">${escapeHTML(post.body || '')}</p>${status}${post.error ? `<p class="post-row-preview">${escapeHTML(post.error)}</p>` : ''}${actions}</div>`;
  const meta = `<div class="post-row-meta">${escapeHTML(when)}</div>`;
  return `<article class="post-row status-${escapeHTML(post.status)} ${full ? 'full-row' : ''}">${content}${meta}</article>`;
}

function renderPosts() {
  const posts = [...(appState?.posts || [])];
  const homeOrder = posts.filter((post) => post.status !== 'published').slice(0, 3);
  const calendarOrder = posts.reverse();
  $('#home-posts').innerHTML = homeOrder.map((post) => postCard(post)).join('');
  $('#calendar-posts').innerHTML = calendarOrder.map((post) => postCard(post, true)).join('');
  const scheduled = posts.filter((post) => post.status === 'scheduled').length;
  $('#scheduled-count').textContent = `${scheduled} ${scheduled === 1 ? 'post' : 'posts'}`;
  bindPostButtons();
}

function renderSources() {
  const sources = appState?.sources || [];
  $('#source-count').textContent = String(sources.length);
  $('#library-count').textContent = String(sources.length);
  $('#source-list').innerHTML = sources.map((source) => `
    <article class="source-item">
      <div class="source-item-head"><div><span class="source-kind">${escapeHTML(source.kind)}</span><h3>${escapeHTML(source.title)}</h3></div><button class="delete-source" data-delete-source="${escapeHTML(source.id)}">Remover</button></div>
      <p>${escapeHTML(source.content)}</p>
    </article>`).join('');
  $$('[data-delete-source]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Remover esta referência do seu caderno?')) return;
    try {
      const data = await request(`/api/sources?id=${encodeURIComponent(button.dataset.deleteSource)}`, { method: 'DELETE' });
      appState.sources = data.sources;
      renderSources();
      showToast('Referência removida.');
    } catch (error) { showToast(error.message, true); }
  }));
}

function fillProfile(profile) {
  const form = $('#profile-form');
  Object.entries(profile || {}).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value || '';
  });
  const name = profile?.name?.trim();
  $('#greeting').textContent = name ? `Que bom ter você por aqui, ${name}.` : 'O que merece ser contado?';
  $('#avatar').textContent = name ? name.slice(0, 1).toLocaleUpperCase('pt-BR') : '✳';
  $('#context-summary').textContent = [profile?.about, profile?.pillars].filter(Boolean).join(' ');
}

function renderConnections() {
  const linkedin = appState?.linkedin || {};
  const hosted = appState?.runtime_mode === 'vercel';
  const pill = $('#connection-pill');
  const pillText = pill.querySelector('span:last-child');
  pillText.textContent = linkedin.connected ? `LinkedIn conectado${linkedin.name ? ` · ${linkedin.name}` : ''}` : 'LinkedIn ainda não conectado';
  pill.classList.toggle('is-connected', Boolean(linkedin.connected));
  $('#linkedin-connection-title').textContent = linkedin.connected ? `Conectado${linkedin.name ? ` como ${linkedin.name}` : ''}` : 'LinkedIn ainda não conectado';
  $('#linkedin-status-badge').textContent = linkedin.connected ? 'Conectado' : 'Pendente';
  $('#linkedin-status-badge').classList.toggle('connected', Boolean(linkedin.connected));
  $('#linkedin-disconnect').hidden = !linkedin.connected;
  const connect = $('#linkedin-connect');
  connect.hidden = Boolean(linkedin.connected);
  connect.setAttribute('aria-disabled', String(!linkedin.configured));
  $('#linkedin-setup-note').textContent = linkedin.configured
    ? linkedin.oauth_mode === 'native-pkce'
      ? 'Ao conectar, o LinkedIn abre no navegador e retorna ao app neste computador. O fluxo PKCE nativo precisa estar habilitado para seu app LinkedIn.'
      : 'As credenciais estão configuradas. Você será levado ao LinkedIn para autorizar a publicação.'
    : linkedin.oauth_mode === 'native-pkce'
      ? 'No computador, configure o Client ID do app e solicite ao LinkedIn a habilitação do fluxo nativo com PKCE. Não precisa de URL pública nem Client Secret.'
      : 'Para liberar a conexão, configure as credenciais do app LinkedIn no servidor e cadastre a URL de retorno HTTPS no LinkedIn.';

  $('#ai-connection-title').textContent = appState?.ai_configured ? 'Escrita assistida pronta' : 'IA ainda não conectada';
  $('#ai-status-badge').textContent = appState?.ai_configured ? 'Pronta' : 'Pendente';
  $('#ai-status-badge').classList.toggle('connected', Boolean(appState?.ai_configured));
  $('#ai-status').textContent = appState?.ai_configured
    ? 'Seu perfil, referências e correções serão usados como contexto.'
    : 'Para gerar rascunhos, configure a chave da API de IA no servidor. Você ainda pode guardar ideias e referências.';
  $('#ai-instructions').innerHTML = appState?.ai_configured
    ? 'A geração usa seu caderno de voz e não deve inventar fatos. Revise qualquer texto antes de publicar.'
    : 'Na Vercel, adicione <code>GEMINI_API_KEY</code> nas variáveis do projeto. No computador, inclua a chave no arquivo <code>.env</code>. A chave fica só no servidor.';

  $('#automation-note-title').textContent = hosted
    ? 'Como a automação funciona no plano gratuito'
    : 'Como a automação funciona no computador';
  $('#automation-note-copy').textContent = hosted
    ? 'A Vercel verifica a agenda uma vez por dia, por volta das 10h de Natal, com uma variação possível de até 59 minutos. Posts programados para outros horários podem aguardar até a conferência do dia seguinte. A publicação depende de o LinkedIn continuar autorizado.'
    : 'O app confere a agenda a cada 20 segundos e publica no horário marcado enquanto o computador estiver ligado e o app aberto. Se ele dormir ou desligar, o post aguarda o próximo momento em que o app estiver ativo.';
  $('#data-note-copy').textContent = hosted
    ? 'Seu perfil, suas referências e seus rascunhos ficam no Neon. O token do LinkedIn é criptografado usando a senha do painel. Na API gratuita do Gemini, o Google pode usar os textos enviados para melhorar produtos; não inclua dados confidenciais.'
    : 'Seu perfil, seu caderno e seus rascunhos ficam neste computador, dentro da pasta data. O token do LinkedIn é protegido por uma chave local. Na API gratuita do Gemini, o Google pode usar os textos enviados para melhorar produtos; não inclua dados confidenciais.';
}

function renderAutomationReadiness() {
  const automation = appState?.automation || {};
  const readiness = $('#automation-readiness');
  if (!automation.enabled) {
    readiness.textContent = 'Desligado. Você ainda pode criar e agendar cada post manualmente.';
    return;
  }
  if (!appState?.ai_configured) {
    readiness.textContent = 'Ativado, mas pausado: conecte a escrita assistida primeiro.';
  } else if (!appState?.linkedin?.connected) {
    readiness.textContent = 'Ativado, mas pausado: conecte seu LinkedIn pessoal primeiro.';
  } else if ((appState?.sources || []).length < 3) {
    readiness.textContent = `Ativado, mas pausado: adicione mais ${3 - (appState?.sources || []).length} referências ao caderno de voz.`;
  } else if (automation.last_status) {
    readiness.textContent = automation.last_status;
  } else {
    readiness.textContent = 'Pronto. A ferramenta vai criar, agendar e publicar sem revisão post a post.';
  }
}

function renderAutomation() {
  const automation = appState?.automation || {};
  $('#automation-enabled').checked = Boolean(automation.enabled);
  $('#posts-per-week').value = String(automation.posts_per_week || 2);
  $('#publish-time').value = automation.publish_time || '10:00';
  $$('input[name="auto-day"]').forEach((checkbox) => {
    checkbox.checked = (automation.days || []).map(Number).includes(Number(checkbox.value));
  });
  renderAutomationReadiness();
}

function renderAll() {
  fillProfile(appState.profile);
  renderSources();
  renderPosts();
  renderConnections();
  renderAutomation();
}

async function refreshState() {
  appState = await request('/api/state');
  renderAll();
}

async function refreshLiveState() {
  if (!appState) return;
  const fresh = await request('/api/state');
  appState.posts = fresh.posts;
  appState.automation = fresh.automation;
  appState.linkedin = fresh.linkedin;
  appState.ai_configured = fresh.ai_configured;
  renderPosts();
  renderConnections();
  renderAutomationReadiness();
}

function bindPostButtons() {
  $$('[data-edit-post]').forEach((button) => button.addEventListener('click', async () => {
    const post = appState.posts.find((item) => item.id === button.dataset.editPost);
    if (!post) return;
    try {
      await openEditor(post);
      showView('home');
    } catch (error) { showToast(error.message, true); }
  }));
  $$('[data-publish-post]').forEach((button) => button.addEventListener('click', () => publishNow(button.dataset.publishPost, button.dataset.uncertain === 'true')));
}

async function openEditor(post) {
  if (currentPostId && currentPostId !== post.id) await flushDraftAutosave();
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = null;
  draftAutosaveDirty = false;
  draftAutosaveFailed = false;
  currentPostId = post.id;
  $('#editor-panel').hidden = false;
  $('#draft-body').value = post.body || '';
  $('#feedback-note').value = post.feedback || '';
  $('#schedule-at').value = post.scheduled_at ? toDateTimeLocal(post.scheduled_at) : '';
  updateCharCount();
  $('#draft-save-status').textContent = post.status === 'scheduled' ? 'Agendamento salvo' : 'Rascunho salvo';
  $('#editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateCharCount() {
  const length = $('#draft-body').value.length;
  $('#char-count').textContent = length > 3000
    ? `${length.toLocaleString('pt-BR')} caracteres · acima do limite de publicação`
    : `${length.toLocaleString('pt-BR')} de 3.000 caracteres`;
  $('#char-count').classList.toggle('over-limit', length > 3000);
}

function queueDraftAutosave() {
  if (!currentPostId) return;
  draftAutosaveDirty = true;
  draftAutosaveFailed = false;
  $('#draft-save-status').textContent = 'Alterações ainda não salvas';
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = setTimeout(() => { void autosaveDraft(); }, 800);
}

async function autosaveDraft() {
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = null;
  if (!currentPostId || !draftAutosaveDirty) return;
  if (draftAutosaveInFlight) {
    await draftAutosaveInFlight.catch(() => {});
    if (draftAutosaveDirty && !draftAutosaveFailed) return autosaveDraft();
    return;
  }

  const postId = currentPostId;
  const snapshot = { body: $('#draft-body').value, feedback: $('#feedback-note').value };
  draftAutosaveDirty = false;
  $('#draft-save-status').textContent = 'Salvando…';
  const pending = request(`/api/posts/${encodeURIComponent(postId)}`, { method: 'PATCH', body: snapshot });
  draftAutosaveInFlight = pending;
  try {
    const data = await pending;
    if (appState) {
      const index = appState.posts.findIndex((post) => post.id === postId);
      if (index >= 0) appState.posts[index] = data.post;
      else appState.posts.unshift(data.post);
    }
    if (currentPostId === postId) {
      const unchanged = $('#draft-body').value === snapshot.body && $('#feedback-note').value === snapshot.feedback;
      if (unchanged) $('#draft-save-status').textContent = 'Salvo automaticamente';
      else draftAutosaveDirty = true;
    }
  } catch (error) {
    draftAutosaveDirty = true;
    draftAutosaveFailed = true;
    if (currentPostId === postId) $('#draft-save-status').textContent = 'Falha ao salvar. Use “Salvar rascunho”.';
  } finally {
    if (draftAutosaveInFlight === pending) draftAutosaveInFlight = null;
  }
  if (draftAutosaveDirty && !draftAutosaveFailed) {
    clearTimeout(draftAutosaveTimer);
    draftAutosaveTimer = setTimeout(() => { void autosaveDraft(); }, 400);
  }
}

async function flushDraftAutosave() {
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = null;
  if (draftAutosaveInFlight) await draftAutosaveInFlight.catch(() => {});
  if (draftAutosaveDirty) {
    draftAutosaveFailed = false;
    await autosaveDraft();
  }
  if (draftAutosaveDirty) throw new Error('Não consegui salvar suas últimas alterações. Tente novamente antes de sair do rascunho.');
}

async function saveCurrentPost(action = 'save') {
  if (!currentPostId) throw new Error('Crie um rascunho antes de salvar.');
  await flushDraftAutosave();
  const data = await request('/api/posts', {
    method: 'POST',
    body: {
      id: currentPostId,
      body: $('#draft-body').value,
      feedback: $('#feedback-note').value,
      action,
      scheduled_at: $('#schedule-at').value,
    },
  });
  draftAutosaveDirty = false;
  draftAutosaveFailed = false;
  $('#draft-save-status').textContent = action === 'schedule' ? 'Agendamento salvo' : 'Rascunho salvo';
  return data.post;
}

async function publishNow(postId = currentPostId, uncertain = false) {
  const post = appState.posts.find((item) => item.id === postId);
  if (!post) return;
  const confirmation = uncertain
    ? 'A conexão caiu durante a última tentativa. Confira o feed do LinkedIn; se o post não estiver lá, tentar publicar de novo?'
    : 'Publicar este texto agora no seu LinkedIn pessoal?';
  if (!window.confirm(confirmation)) return;
  try {
    if (postId === currentPostId) await saveCurrentPost('save');
    const result = await request(`/api/posts/${encodeURIComponent(postId)}/publish`, { method: 'POST', body: {} });
    await refreshState();
    if (result.post?.status === 'uncertain') {
      showToast(result.post.error || 'Confira seu LinkedIn antes de tentar novamente.', true);
      return;
    }
    if (result.post?.status === 'failed') throw new Error(result.post.error || 'O LinkedIn não aceitou a publicação.');
    if (result.post?.status === 'published') showToast('Post publicado no seu LinkedIn.');
    else showToast('A publicação está em andamento. Confira a agenda para acompanhar o resultado.');
  } catch (error) { showToast(error.message, true); }
}

function wireEvents() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $$('[data-open-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.openView)));

  $('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: appState?.timezone || 'America/Fortaleza', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('#draft-body').addEventListener('input', () => { updateCharCount(); queueDraftAutosave(); });
  $('#feedback-note').addEventListener('input', queueDraftAutosave);
  $('#close-editor').addEventListener('click', async () => {
    try {
      await flushDraftAutosave();
      $('#editor-panel').hidden = true;
      currentPostId = null;
    } catch (error) { showToast(error.message, true); }
  });

  $('#copy-draft').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#draft-body').value);
      showToast('Texto copiado.');
    } catch (error) { showToast('Não consegui copiar. Selecione e copie o texto manualmente.', true); }
  });

  $('#export-data').addEventListener('click', () => {
    window.location.assign('/api/export');
    showToast('Sua cópia de segurança está sendo preparada.');
  });

  $('#generate-button').addEventListener('click', async () => {
    const button = $('#generate-button');
    button.disabled = true;
    button.innerHTML = '<span>✳</span> Buscando sua voz…';
    try {
      const data = await request('/api/generate', {
        method: 'POST',
        body: { topic: $('#topic').value.trim(), format: $('#format-select').value },
      });
      appState.posts.unshift(data.post);
      await openEditor(data.post);
      $('#topic').value = '';
      renderPosts();
      showToast('Seu rascunho está pronto para você revisar.');
    } catch (error) { showToast(error.message, true); }
    finally {
      button.disabled = false;
      button.innerHTML = '<span>✳</span> Criar rascunho';
    }
  });

  $('#manual-start').addEventListener('click', async () => {
    try {
      const data = await request('/api/posts/manual', { method: 'POST', body: {} });
      appState.posts.unshift(data.post);
      await openEditor(data.post);
      renderPosts();
    } catch (error) { showToast(error.message, true); }
  });

  $('#save-draft').addEventListener('click', async () => {
    try {
      await saveCurrentPost('save');
      await refreshState();
      showToast('Rascunho guardado.');
    } catch (error) { showToast(error.message, true); }
  });

  $('#schedule-post').addEventListener('click', async () => {
    try {
      await saveCurrentPost('schedule');
      await refreshState();
      showToast('Post agendado. A publicação acontece na próxima conferência da agenda.');
    } catch (error) { showToast(error.message, true); }
  });

  $('#publish-now').addEventListener('click', () => publishNow());

  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const profile = Object.fromEntries(form.entries());
    try {
      const data = await request('/api/profile', { method: 'POST', body: profile });
      appState.profile = data.profile;
      fillProfile(data.profile);
      $('#profile-saved').textContent = 'Seu contexto foi guardado.';
      setTimeout(() => { $('#profile-saved').textContent = ''; }, 2800);
      showToast('Seu contexto está atualizado.');
    } catch (error) { showToast(error.message, true); }
  });

  $('#automation-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const days = $$('input[name="auto-day"]:checked').map((checkbox) => Number(checkbox.value));
    try {
      const data = await request('/api/automation', {
        method: 'POST',
        body: {
          enabled: $('#automation-enabled').checked,
          posts_per_week: Number($('#posts-per-week').value),
          days,
          publish_time: $('#publish-time').value,
        },
      });
      appState.automation = data.automation;
      renderAutomation();
      showToast('Seu ritmo semanal foi guardado.');
    } catch (error) { showToast(error.message, true); }
  });

  $('#source-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await request('/api/sources', {
        method: 'POST',
        body: { title: form.get('title'), kind: form.get('kind'), content: form.get('content') },
      });
      appState.sources = data.sources;
      event.currentTarget.reset();
      renderSources();
      showToast('Referência guardada no seu caderno.');
    } catch (error) { showToast(error.message, true); }
  });

  $('#linkedin-disconnect').addEventListener('click', async () => {
    if (!window.confirm('Desconectar seu perfil do LinkedIn desta ferramenta?')) return;
    try {
      await request('/api/linkedin/disconnect', { method: 'POST', body: {} });
      await refreshState();
      showToast('Seu LinkedIn foi desconectado.');
    } catch (error) { showToast(error.message, true); }
  });

  $('#linkedin-connect').addEventListener('click', (event) => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      showToast('Configure primeiro o app do LinkedIn e a URL HTTPS de retorno.', true);
    }
  });
}

async function start() {
  wireEvents();
  setDefaultSchedule();
  const query = new URLSearchParams(window.location.search);
  const linkedinNotice = query.get('linkedin');
  if (linkedinNotice === 'connected') showToast('Seu LinkedIn está conectado.');
  if (linkedinNotice === 'cancelled') showToast('A conexão foi cancelada.');
  if (linkedinNotice === 'error' || linkedinNotice === 'state_error') showToast('Não consegui concluir a conexão. Confira as configurações e tente de novo.', true);
  if (linkedinNotice) window.history.replaceState({}, '', window.location.pathname);
  try {
    await refreshState();
  } catch (error) {
    showToast(error.message || 'Não consegui abrir seus dados agora.', true);
  }
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshLiveState().catch(() => {});
  }, 60000);
  window.addEventListener('beforeunload', (event) => {
    if (!draftAutosaveDirty && !draftAutosaveInFlight) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

start();
