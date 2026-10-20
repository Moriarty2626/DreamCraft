const ROLE_LEVEL = {
  o5: 999, creator: 100, upravlyayushiy: 90, rukovodstvo: 80,
  rp_master: 50, tech: 40, builders: 40, iad: 40, discord: 30, dreamcraft: 20
};

const ROLES = [
  { id: 'o5', name: '???', level: 999 },
  { id: 'creator', name: 'Создатель', level: 100 },
  { id: 'upravlyayushiy', name: 'Управляющий', level: 90 },
  { id: 'rukovodstvo', name: 'Руководство', level: 80 },
  { id: 'rp_master', name: 'RP-мастер', level: 50 },
  { id: 'tech', name: 'Тех.Администрация', level: 40 },
  { id: 'builders', name: 'Строители', level: 40 },
  { id: 'iad', name: 'IAD', level: 40 },
  { id: 'discord', name: 'Discord-отдел', level: 30 },
  { id: 'dreamcraft', name: 'DreamCraft (MC)', level: 20 }
];

function roleName(id) {
  const r = ROLES.find(x => x.id === id);
  return r ? r.name : id;
}

let token = localStorage.getItem('dc_token') || null;
let currentUser = null;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#main-screen').classList.add('hidden');
}
function showMain() {
  $('#login-screen').classList.add('hidden');
  $('#main-screen').classList.remove('hidden');
}

function md(text) {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  html = html.replace(/\|(.+)\|/g, row => {
    if (/^[\s|:-]+$/.test(row.replace(/\|/g, ''))) return '';
    const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
    return '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, m => '<table>' + m + '</table>');
  return html.split('\n\n').map(p => {
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<table')) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

function hideAllPanels() {
  ['panel-docs', 'panel-users', 'panel-settings', 'panel-cheats', 'panel-guide'].forEach(id => {
    const el = $('#' + id);
    if (el) el.classList.add('hidden');
  });
  $$('.nav-item').forEach(b => b.classList.remove('active'));
}

function openPanel(name) {
  hideAllPanels();
  const el = $('#panel-' + name);
  if (el) el.classList.remove('hidden');
}

function loadDocsNav() {
  const nav = $('#nav-docs');
  nav.innerHTML = '';
  const docs = window.DOCS || {};
  Object.keys(docs).forEach(id => {
    const doc = docs[id];
    if (!doc.roles.includes(currentUser.role) && currentUser.role !== 'creator' && currentUser.role !== 'o5') return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.textContent = doc.title;
    btn.onclick = () => {
      hideAllPanels();
      btn.classList.add('active');
      const panel = $('#panel-docs');
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <h1>${doc.title}</h1>
        <div class="meta">Только для авторизованных сотрудников</div>
        <div class="doc-content">${md(doc.content)}</div>
      `;
    };
    nav.appendChild(btn);
  });
}

function canDelete(targetRole, targetId) {
  if (targetId && targetId === currentUser.id) return false;
  if (currentUser.role === 'o5') return true;
  if (currentUser.role === 'creator' || currentUser.role === 'upravlyayushiy') {
    return targetRole !== 'creator' && targetRole !== 'o5';
  }
  return (ROLE_LEVEL[targetRole] || 0) < (ROLE_LEVEL[currentUser.role] || 0);
}

async function loadUsersUI() {
  try {
    const { users } = await api('/api/users');
    const list = $('#users-list');
    list.innerHTML = '';
    const roleSelect = $('#new-role');
    roleSelect.innerHTML = '';
    const myLevel = ROLE_LEVEL[currentUser.role] || 0;
    ROLES.forEach(r => {
      if (currentUser.role === 'o5' || currentUser.role === 'creator' || r.level < myLevel) {
        if (currentUser.role === 'creator' && r.id === 'o5') return;
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        roleSelect.appendChild(opt);
      }
    });
    users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div>
          <strong>${u.displayName || u.login}</strong>
          <span class="role-tag">${roleName(u.role)}</span>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">
            ${u.login}${u.email ? ' · ' + u.email : ''}
          </div>
        </div>
        ${canDelete(u.role, u.id) ? `<button class="del-btn" data-id="${u.id}">Удалить</button>` : ''}
      `;
      list.appendChild(card);
    });
    $$('.del-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Удалить аккаунт?')) return;
        try {
          await api('/api/users/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' });
          loadUsersUI();
        } catch (e) {
          alert(e.message);
        }
      };
    });
  } catch (e) {
    $('#users-list').innerHTML = '<div class="error">' + e.message + '</div>';
  }
}

function initMain(user) {
  currentUser = user;
  $('#user-info').innerHTML = `<strong>${user.displayName || user.login}</strong>${roleName(user.role)}`;
  const canManage = (ROLE_LEVEL[user.role] || 0) >= 80 || user.role === 'o5';
  if (canManage) $('#btn-users').classList.remove('hidden');
  else $('#btn-users').classList.add('hidden');
  loadDocsNav();
  showMain();
  openPanel('docs');
  $('#panel-docs').innerHTML = `<div class="welcome"><h1>Добро пожаловать</h1><p>Выберите документ слева</p></div>`;
}

async function trySession() {
  if (!token) {
    showLogin();
    return;
  }
  try {
    const { user } = await api('/api/me');
    initMain(user);
  } catch {
    token = null;
    localStorage.removeItem('dc_token');
    showLogin();
  }
}

$('#login-form').onsubmit = async e => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        login: $('#login-input').value.trim(),
        password: $('#password-input').value
      })
    });
    token = data.token;
    localStorage.setItem('dc_token', token);
    initMain(data.user);
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
};

$('#btn-logout').onclick = () => {
  token = null;
  localStorage.removeItem('dc_token');
  currentUser = null;
  showLogin();
};

$('#btn-users').onclick = () => {
  openPanel('users');
  loadUsersUI();
};

$('#btn-settings').onclick = () => {
  openPanel('settings');
  $('#set-name').value = currentUser.displayName || '';
  $('#name-msg').textContent = '';
  $('#pass-msg').textContent = '';
  $('#set-old-pass').value = '';
  $('#set-new-pass').value = '';
  $('#set-new-pass2').value = '';
};

$('#nav-cheats').onclick = function () {
  openPanel('cheats');
  this.classList.add('active');
};
$('#nav-guide').onclick = function () {
  openPanel('guide');
  this.classList.add('active');
};

$('#btn-create').onclick = async () => {
  const msg = $('#create-msg');
  msg.textContent = '';
  msg.className = 'msg';
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        login: $('#new-login').value.trim(),
        password: $('#new-password').value,
        email: $('#new-email').value.trim() || null,
        displayName: $('#new-displayname').value.trim() || null,
        role: $('#new-role').value
      })
    });
    msg.textContent = 'Аккаунт создан — человек может входить с любого браузера';
    msg.className = 'msg ok';
    $('#new-login').value = '';
    $('#new-password').value = '';
    $('#new-email').value = '';
    $('#new-displayname').value = '';
    loadUsersUI();
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg err';
  }
};

$('#btn-save-name').onclick = async () => {
  const msg = $('#name-msg');
  const name = $('#set-name').value.trim();
  if (!name) {
    msg.textContent = 'Введи имя';
    msg.className = 'msg err';
    return;
  }
  try {
    const data = await api('/api/me/profile', {
      method: 'POST',
      body: JSON.stringify({ displayName: name })
    });
    currentUser = data.user;
    $('#user-info').innerHTML = `<strong>${name}</strong>${roleName(currentUser.role)}`;
    msg.textContent = 'Имя сохранено';
    msg.className = 'msg ok';
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg err';
  }
};

$('#btn-save-pass').onclick = async () => {
  const msg = $('#pass-msg');
  const oldP = $('#set-old-pass').value;
  const newP = $('#set-new-pass').value;
  const newP2 = $('#set-new-pass2').value;
  if (!oldP || !newP) {
    msg.textContent = 'Заполни поля';
    msg.className = 'msg err';
    return;
  }
  if (newP !== newP2) {
    msg.textContent = 'Новые пароли не совпадают';
    msg.className = 'msg err';
    return;
  }
  try {
    await api('/api/me/profile', {
      method: 'POST',
      body: JSON.stringify({ oldPassword: oldP, newPassword: newP })
    });
    msg.textContent = 'Пароль изменён';
    msg.className = 'msg ok';
    $('#set-old-pass').value = '';
    $('#set-new-pass').value = '';
    $('#set-new-pass2').value = '';
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg err';
  }
};

trySession();
