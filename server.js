const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'DreamCraft_Secret_2026_ChangeInProd';
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const ROLE_LEVEL = {
  o5: 999,
  creator: 100,
  upravlyayushiy: 90,
  rukovodstvo: 80,
  rp_master: 50,
  tech: 40,
  builders: 40,
  iad: 40,
  discord: 30,
  dreamcraft: 20
};

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch {
    return false;
  }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 24 * 3600 }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
  });
}

function getAuth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return verifyToken(h.slice(7));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    });
    res.end();
    return;
  }

  try {
    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const { login, password } = body;
      if (!login || !password) return sendJson(res, 400, { error: 'Укажите логин и пароль' });
      const users = readUsers();
      const user = users.find(u => u.login.toLowerCase() === String(login).toLowerCase());
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { error: 'Неверный логин или пароль' });
      }
      const token = signToken({
        id: user.id,
        login: user.login,
        role: user.role,
        displayName: user.displayName
      });
      return sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          login: user.login,
          role: user.role,
          displayName: user.displayName,
          email: user.email
        }
      });
    }

    const user = getAuth(req);

    if (pathname === '/api/me' && req.method === 'GET') {
      if (!user) return sendJson(res, 401, { error: 'Требуется авторизация' });
      return sendJson(res, 200, { user });
    }

    if (pathname === '/api/roles' && req.method === 'GET') {
      if (!user) return sendJson(res, 401, { error: 'Требуется авторизация' });
      const roles = [
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
      return sendJson(res, 200, { roles });
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      if (!user) return sendJson(res, 401, { error: 'Требуется авторизация' });
      if ((ROLE_LEVEL[user.role] || 0) < 80 && user.role !== 'o5') {
        return sendJson(res, 403, { error: 'Недостаточно прав' });
      }
      const users = readUsers().map(u => ({
        id: u.id,
        login: u.login,
        email: u.email,
        role: u.role,
        displayName: u.displayName,
        createdAt: u.createdAt,
        createdBy: u.createdBy
      }));
      return sendJson(res, 200, { users });
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      if (!user) return sendJson(res, 401, { error: 'Требуется авторизация' });
      const myLevel = ROLE_LEVEL[user.role] || 0;
      if (myLevel < 80 && user.role !== 'o5') {
        return sendJson(res, 403, { error: 'Недостаточно прав' });
      }

      const body = await parseBody(req);
      const { login, password, email, role, displayName } = body;
      if (!login || !password || !role) {
        return sendJson(res, 400, { error: 'Логин, пароль и роль обязательны' });
      }

      if (user.role !== 'o5') {
        if (role === 'o5') return sendJson(res, 403, { error: 'Нельзя создавать роль ???' });
        if (user.role !== 'creator' && (ROLE_LEVEL[role] || 0) >= myLevel) {
          return sendJson(res, 403, { error: 'Нельзя создавать аккаунты своего или более высокого уровня' });
        }
      }

      const users = readUsers();
      if (users.find(u => u.login.toLowerCase() === String(login).toLowerCase())) {
        return sendJson(res, 400, { error: 'Логин уже занят' });
      }

      const newUser = {
        id: uuid(),
        login: String(login).trim(),
        passwordHash: hashPassword(password),
        email: email || null,
        role,
        displayName: displayName || login,
        createdAt: new Date().toISOString(),
        createdBy: user.login
      };
      users.push(newUser);
      writeUsers(users);
      return sendJson(res, 200, {
        success: true,
        user: {
          id: newUser.id,
          login: newUser.login,
          email: newUser.email,
          role: newUser.role,
          displayName: newUser.displayName
        }
      });
    }

    if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
      if (!user) return sendJson(res, 401, { error: 'Требуется авторизация' });
      const myLevel = ROLE_LEVEL[user.role] || 0;
      if (myLevel < 80 && user.role !== 'o5') {
        return sendJson(res, 403, { error: 'Недостаточно прав' });
      }

      const id = decodeURIComponent(pathname.split('/').pop());
      const users = readUsers();
      const target = users.find(u => u.id === id);
      if (!target) return sendJson(res, 404, { error: 'Пользователь не найден' });
      if (target.id === user.id) return sendJson(res, 403, { error: 'Нельзя удалить себя' });

      if (user.role === 'o5') {
        // can delete anyone except self
      } else if (user.role === 'creator' || user.role === 'upravlyayushiy') {
        if (target.role === 'o5' || target.role === 'creator') {
          return sendJson(res, 403, { error: 'Нельзя удалить этот аккаунт' });
        }
      } else if ((ROLE_LEVEL[target.role] || 0) >= myLevel) {
        return sendJson(res, 403, { error: 'Нельзя удалять аккаунты своего или более высокого уровня' });
      }

      writeUsers(users.filter(u => u.id !== id));
      return sendJson(res, 200, { success: true });
    }

    // change password / name
    if (pathname === '/api/me/profile' && req.method === 'POST') {
      if (!user) return sendJson(res, 401, { error: 'Требуется авторизация' });
      const body = await parseBody(req);
      const users = readUsers();
      const u = users.find(x => x.id === user.id);
      if (!u) return sendJson(res, 404, { error: 'Не найден' });

      if (body.displayName) {
        u.displayName = String(body.displayName).trim();
      }
      if (body.newPassword) {
        if (!body.oldPassword || !verifyPassword(body.oldPassword, u.passwordHash)) {
          return sendJson(res, 400, { error: 'Текущий пароль неверный' });
        }
        if (String(body.newPassword).length < 4) {
          return sendJson(res, 400, { error: 'Пароль слишком короткий' });
        }
        u.passwordHash = hashPassword(body.newPassword);
      }
      writeUsers(users);
      return sendJson(res, 200, {
        success: true,
        user: { id: u.id, login: u.login, role: u.role, displayName: u.displayName, email: u.email }
      });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'Внутренняя ошибка' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }

  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  DreamCraft Panel');
  console.log('  ----------------');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('  ???  /  *PsijGQRqVkmfxegnK6j&Cqdk0jh3S');
  console.log('  creator / DreamCraft2026!');
  console.log('');
});
