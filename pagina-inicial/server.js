'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const scrypt = promisify(crypto.scrypt);
const webRoot = __dirname;
const dataDirectory = path.resolve(process.env.SABI_DATA_DIR || path.resolve(__dirname, '..', '.local'));
const databasePath = path.join(dataDirectory, 'mesas.sqlite');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const cookieName = 'sabi_session';

fs.mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mesas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fichas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rpg TEXT NOT NULL DEFAULT '',
    race TEXT NOT NULL DEFAULT '',
    character_class TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fichas_owner_created ON fichas(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS ficha_mesas (
    ficha_id TEXT NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
    mesa_id TEXT NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
    PRIMARY KEY (ficha_id, mesa_id)
  );
  CREATE TABLE IF NOT EXISTS members (
    mesa_id TEXT NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (mesa_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    mesa_id TEXT NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at INTEGER NOT NULL,
    reviewed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS requests_pending_mesa ON requests(mesa_id, status);
  CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
`);

const rateBuckets = new Map();
const loginWindow = 15 * 60 * 1000;

function rateLimitHit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function rateLimitExceeded(key, limit) {
  const bucket = rateBuckets.get(key);
  return Boolean(bucket && bucket.reset > Date.now() && bucket.count >= limit);
}

function manutencaoBanco() {
  try {
    database.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (error) {
    console.error('Falha na manutenção do banco de dados.', error);
  }
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.reset <= now) rateBuckets.delete(key);
  }
}

manutencaoBanco();
setInterval(manutencaoBanco, 60 * 60 * 1000).unref();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Sabi-App': 'Sabi',
    ...headers
  });
  response.end(JSON.stringify(data));
}

function decodeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Parâmetro inválido na URL.');
  }
}

const maxBodyBytes = 10_000;

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    request.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        failed = true;
        chunks.length = 0;
        reject(new HttpError(413, 'O conteúdo enviado é muito grande.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (failed) return;
      let parsed;
      try {
        parsed = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      } catch {
        reject(new HttpError(400, 'O conteúdo enviado não é JSON válido.'));
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(new HttpError(400, 'O conteúdo enviado deve ser um objeto JSON.'));
        return;
      }
      resolve(parsed);
    });
    request.on('error', reject);
    request.on('close', () => {
      if (!request.complete) reject(new HttpError(400, 'A requisição foi interrompida.'));
    });
  });
}

function requireSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw new HttpError(403, 'Origem da solicitação não permitida.');
  }
  if (originHost !== String(request.headers.host || '').toLowerCase()) {
    throw new HttpError(403, 'Origem da solicitação não permitida.');
  }
}

function cookieValue(request, name) {
  const cookies = (request.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return '';
}

function sessionCookie(value, maxAge) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${cookieName}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

function currentUser(request) {
  const token = cookieValue(request, cookieName);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = database.prepare(`
    SELECT users.id, users.name, users.email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, Date.now());
  return row || null;
}

function requireUser(request) {
  const user = currentUser(request);
  if (!user) throw new HttpError(401, 'Faça login para continuar.');
  return user;
}

async function createSession(userId, previousToken = '') {
  if (previousToken) {
    const previousHash = crypto.createHash('sha256').update(previousToken).digest('hex');
    database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(previousHash);
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + sessionDuration;
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash, userId, expiresAt);
  return token;
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

function cleanSearch(value) {
  return value.slice(0, 100).replace(/[\\%_]/g, character => `\\${character}`);
}

function sendStaticFile(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Caminho inválido.');
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const filePath = path.resolve(webRoot, relativePath);
  if (!filePath.startsWith(`${webRoot}${path.sep}`)) {
    throw new HttpError(403, 'Acesso negado.');
  }

  const relativeToRoot = path.relative(webRoot, filePath).split(path.sep).join('/');
  const publicFiles = ['index.html', 'sw.js', 'manifest.webmanifest'];
  const publicFolders = ['pages/', 'css/', 'js/', 'img/'];
  if (!publicFiles.includes(relativeToRoot) && !publicFolders.some(folder => relativeToRoot.startsWith(folder))) {
    throw new HttpError(404, 'Página não encontrada.');
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new HttpError(404, 'Página não encontrada.');
  }
  if (!stat.isFile()) throw new HttpError(404, 'Página não encontrada.');

  const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };
  response.writeHead(200, {
    'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  if (request.method === 'HEAD') return response.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

async function handleApi(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    throw new HttpError(405, 'Método não permitido.');
  }

  if (method === 'GET' && pathname === '/api/me') {
    return sendJson(response, 200, { user: currentUser(request) });
  }

  if (method === 'GET' && pathname === '/api/status') {
    return sendJson(response, 200, {
      features: ['fichas']
    });
  }

  if (method === 'POST' && (pathname === '/api/register' || pathname === '/api/login')) {
    requireSameOrigin(request);
    const body = await readJson(request);
    const clientIp = request.socket.remoteAddress || 'desconhecido';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (pathname === '/api/register') {
      if (rateLimitHit(`register:${clientIp}`, 10, 60 * 60 * 1000)) {
        throw new HttpError(429, 'Muitas tentativas de cadastro. Tente novamente mais tarde.');
      }
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 2 || name.length > 60) {
        throw new HttpError(400, 'O nome deve ter entre 2 e 60 caracteres.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw new HttpError(400, 'Informe um e-mail válido.');
      }
      if (password.length < 12 || password.length > 128) {
        throw new HttpError(400, 'A senha deve ter entre 12 e 128 caracteres.');
      }
      const credentials = await hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        createdAt: Date.now()
      };
      try {
        database.prepare(`
          INSERT INTO users (id, name, email, password_salt, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(user.id, user.name, user.email, user.passwordSalt, user.passwordHash, user.createdAt);
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed')) {
          throw new HttpError(409, 'Já existe uma conta com este e-mail.');
        }
        throw error;
      }
      const token = await createSession(user.id, cookieValue(request, cookieName));
      return sendJson(response, 201, {
        user: { id: user.id, name: user.name, email: user.email }
      }, { 'Set-Cookie': sessionCookie(token, sessionDuration / 1000) });
    }

    const ipKey = `login-ip:${clientIp}`;
    const emailKey = `login-email:${email}`;
    if (rateLimitExceeded(ipKey, 30) || rateLimitExceeded(emailKey, 8)) {
      throw new HttpError(429, 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
    }
    const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const credentials = password.length > 128
      ? null
      : user
        ? await hashPassword(password, user.password_salt)
        : await hashPassword(password, 'sabi-login-dummy-salt');
    const valid = Boolean(user && credentials &&
      Buffer.from(credentials.hash, 'hex').length === Buffer.from(user.password_hash, 'hex').length &&
      crypto.timingSafeEqual(Buffer.from(credentials.hash, 'hex'), Buffer.from(user.password_hash, 'hex')));
    if (!valid) {
      rateLimitHit(ipKey, 30, loginWindow);
      rateLimitHit(emailKey, 8, loginWindow);
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    rateBuckets.delete(emailKey);
    const token = await createSession(user.id, cookieValue(request, cookieName));
    return sendJson(response, 200, {
      user: { id: user.id, name: user.name, email: user.email }
    }, { 'Set-Cookie': sessionCookie(token, sessionDuration / 1000) });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    requireSameOrigin(request);
    const token = cookieValue(request, cookieName);
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    }
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  const user = requireUser(request);

  if (method === 'GET' && pathname === '/api/fichas') {
    const fichas = database.prepare(`
      SELECT fichas.id, fichas.name, fichas.rpg, fichas.race,
        fichas.character_class, fichas.created_at,
        GROUP_CONCAT(mesas.name, ', ') AS mesa_names
      FROM fichas
      LEFT JOIN ficha_mesas ON ficha_mesas.ficha_id = fichas.id
      LEFT JOIN mesas ON mesas.id = ficha_mesas.mesa_id
      WHERE fichas.user_id = ?
      GROUP BY fichas.id
      ORDER BY fichas.created_at DESC
    `).all(user.id);
    return sendJson(response, 200, { fichas });
  }

  if (method === 'POST' && pathname === '/api/fichas') {
    requireSameOrigin(request);
    const body = await readJson(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rpg = typeof body.rpg === 'string' ? body.rpg.trim() : '';
    const race = typeof body.race === 'string' ? body.race.trim() : '';
    const characterClass = typeof body.characterClass === 'string' ? body.characterClass.trim() : '';
    if (!Array.isArray(body.mesaIds) || body.mesaIds.length > 50 ||
      body.mesaIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 100)) {
      throw new HttpError(400, 'Escolha pelo menos uma mesa válida para esta ficha.');
    }
    const mesaIds = [...new Set(body.mesaIds)];
    if (name.length < 1 || name.length > 60) {
      throw new HttpError(400, 'O nome da ficha deve ter entre 1 e 60 caracteres.');
    }
    if (rpg.length > 60 || race.length > 60 || characterClass.length > 60) {
      throw new HttpError(400, 'Os campos da ficha devem ter no máximo 60 caracteres.');
    }
    if (mesaIds.length === 0) {
      throw new HttpError(400, 'Escolha pelo menos uma mesa para esta ficha.');
    }
    const placeholders = mesaIds.map(() => '?').join(', ');
    const mesasPermitidas = database.prepare(`
      SELECT mesas.id, mesas.name
      FROM mesas
      LEFT JOIN members ON members.mesa_id = mesas.id AND members.user_id = ?
      WHERE (mesas.owner_id = ? OR members.user_id = ?)
        AND mesas.id IN (${placeholders})
    `).all(user.id, user.id, user.id, ...mesaIds);
    if (mesasPermitidas.length !== mesaIds.length) {
      throw new HttpError(400, 'Escolha somente mesas das quais você participa.');
    }
    const ficha = {
      id: crypto.randomUUID(),
      name,
      rpg,
      race,
      character_class: characterClass,
      created_at: Date.now()
    };
    database.exec('BEGIN');
    try {
      database.prepare(`
        INSERT INTO fichas (id, user_id, name, rpg, race, character_class, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(ficha.id, user.id, ficha.name, ficha.rpg, ficha.race, ficha.character_class, ficha.created_at);
      const vincularMesa = database.prepare('INSERT INTO ficha_mesas (ficha_id, mesa_id) VALUES (?, ?)');
      mesaIds.forEach(mesaId => vincularMesa.run(ficha.id, mesaId));
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    ficha.mesa_names = mesasPermitidas.map(mesa => mesa.name).join(', ');
    return sendJson(response, 201, { ficha });
  }

  if (method === 'GET' && pathname === '/api/mesas') {
    const term = url.searchParams.get('search') || '';
    const escaped = cleanSearch(term);
    const like = `%${escaped}%`;
    const mesas = database.prepare(`
      SELECT mesas.id, mesas.name, mesas.created_at,
        CASE WHEN mesas.owner_id = ? OR EXISTS (
          SELECT 1 FROM members WHERE members.mesa_id = mesas.id AND members.user_id = ?
        ) THEN 1 ELSE 0 END AS is_member,
        EXISTS (
          SELECT 1 FROM requests
          WHERE requests.mesa_id = mesas.id AND requests.user_id = ? AND requests.status = 'pending'
        ) AS request_pending,
        (
          SELECT requests.status FROM requests
          WHERE requests.mesa_id = mesas.id AND requests.user_id = ?
          ORDER BY requests.created_at DESC LIMIT 1
        ) AS last_request_status
      FROM mesas
      WHERE (? = '' OR mesas.id = ? OR mesas.name LIKE ? ESCAPE '\\')
      ORDER BY mesas.created_at DESC
      LIMIT 200
    `).all(user.id, user.id, user.id, user.id, term, term, like);
    return sendJson(response, 200, { mesas });
  }

  if (method === 'GET' && pathname === '/api/minhas-mesas') {
    const mesas = database.prepare(`
      SELECT mesas.id, mesas.name, mesas.created_at, mesas.owner_id,
        CASE WHEN mesas.owner_id = ? THEN 'dono' ELSE 'membro' END AS role,
        (SELECT COUNT(*) + 1 FROM members WHERE members.mesa_id = mesas.id) AS members_count
      FROM mesas
      LEFT JOIN members ON members.mesa_id = mesas.id AND members.user_id = ?
      WHERE mesas.owner_id = ? OR members.user_id = ?
      ORDER BY mesas.created_at DESC
    `).all(user.id, user.id, user.id, user.id);
    return sendJson(response, 200, { mesas });
  }

  const mesaDetailsRoute = pathname.match(/^\/api\/mesas\/([^/]+)$/);
  if (method === 'GET' && mesaDetailsRoute) {
    const mesaId = decodeParam(mesaDetailsRoute[1]);
    const mesa = database.prepare(`
      SELECT mesas.id, mesas.name, mesas.created_at, mesas.owner_id,
        users.name AS creator_name
      FROM mesas JOIN users ON users.id = mesas.owner_id
      WHERE mesas.id = ?
    `).get(mesaId);
    if (!mesa) throw new HttpError(404, 'Mesa não encontrada.');
    const isOwner = mesa.owner_id === user.id;
    const isMember = Boolean(database.prepare(
      'SELECT 1 FROM members WHERE mesa_id = ? AND user_id = ?'
    ).get(mesaId, user.id));
    if (!isOwner && !isMember) {
      throw new HttpError(403, 'Somente participantes podem acessar esta mesa.');
    }

    const members = database.prepare(`
      SELECT users.id, users.name, members.joined_at
      FROM members JOIN users ON users.id = members.user_id
      WHERE members.mesa_id = ?
      ORDER BY members.joined_at
    `).all(mesaId);
    return sendJson(response, 200, {
      mesa: {
        id: mesa.id,
        name: mesa.name,
        created_at: mesa.created_at,
        creator: { id: mesa.owner_id, name: mesa.creator_name },
        role: isOwner ? 'dono' : 'membro',
        members_count: members.length + 1,
        members: [
          { id: mesa.owner_id, name: mesa.creator_name, role: 'dono' },
          ...members.map(member => ({ ...member, role: 'membro' }))
        ]
      }
    });
  }

  if (method === 'DELETE' && mesaDetailsRoute) {
    requireSameOrigin(request);
    const mesaId = decodeParam(mesaDetailsRoute[1]);
    const mesa = database.prepare('SELECT owner_id FROM mesas WHERE id = ?').get(mesaId);
    if (!mesa) throw new HttpError(404, 'Mesa não encontrada.');
    if (mesa.owner_id !== user.id) throw new HttpError(403, 'Somente o dono da mesa pode excluí-la.');
    database.prepare('DELETE FROM mesas WHERE id = ?').run(mesaId);
    return sendJson(response, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/solicitacoes/recebidas') {
    const requests = database.prepare(`
      SELECT requests.id, requests.mesa_id, mesas.name AS mesa_name,
        users.name AS requester_name, users.email AS requester_email, requests.created_at
      FROM requests
      JOIN mesas ON mesas.id = requests.mesa_id
      JOIN users ON users.id = requests.user_id
      WHERE mesas.owner_id = ? AND requests.status = 'pending'
      ORDER BY requests.created_at ASC
    `).all(user.id);
    return sendJson(response, 200, { requests });
  }

  if (method === 'POST' && pathname === '/api/mesas') {
    requireSameOrigin(request);
    const body = await readJson(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 60) {
      throw new HttpError(400, 'O nome da mesa deve ter entre 2 e 60 caracteres.');
    }
    const mesa = { id: crypto.randomUUID(), name, ownerId: user.id, createdAt: Date.now() };
    database.prepare('INSERT INTO mesas (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .run(mesa.id, mesa.name, mesa.ownerId, mesa.createdAt);
    return sendJson(response, 201, { mesa });
  }

  const requestRoute = pathname.match(/^\/api\/mesas\/([^/]+)\/solicitacoes$/);
  if (method === 'POST' && requestRoute) {
    requireSameOrigin(request);
    const mesaId = decodeParam(requestRoute[1]);
    const mesa = database.prepare('SELECT id, owner_id FROM mesas WHERE id = ?').get(mesaId);
    if (!mesa) throw new HttpError(404, 'Mesa não encontrada.');
    const alreadyMember = mesa.owner_id === user.id ||
      database.prepare('SELECT 1 FROM members WHERE mesa_id = ? AND user_id = ?').get(mesaId, user.id);
    if (alreadyMember) throw new HttpError(409, 'Você já faz parte desta mesa.');
    const pending = database.prepare(`
      SELECT id FROM requests WHERE mesa_id = ? AND user_id = ? AND status = 'pending'
    `).get(mesaId, user.id);
    if (pending) throw new HttpError(409, 'Você já tem uma solicitação pendente para esta mesa.');
    const requestId = crypto.randomUUID();
    database.prepare(`
      INSERT INTO requests (id, mesa_id, user_id, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(requestId, mesaId, user.id, Date.now());
    return sendJson(response, 201, { requestId, status: 'pending' });
  }

  const reviewRoute = pathname.match(/^\/api\/solicitacoes\/([^/]+)\/(aprovar|rejeitar)$/);
  if (method === 'POST' && reviewRoute) {
    requireSameOrigin(request);
    const requestId = decodeParam(reviewRoute[1]);
    const decision = reviewRoute[2] === 'aprovar' ? 'accepted' : 'rejected';
    const joinRequest = database.prepare(`
      SELECT requests.id, requests.mesa_id, requests.user_id, requests.status, mesas.owner_id
      FROM requests JOIN mesas ON mesas.id = requests.mesa_id
      WHERE requests.id = ?
    `).get(requestId);
    if (!joinRequest) throw new HttpError(404, 'Solicitação não encontrada.');
    if (joinRequest.owner_id !== user.id) throw new HttpError(403, 'Somente o dono da mesa pode analisar solicitações.');
    if (joinRequest.status !== 'pending') throw new HttpError(409, 'Esta solicitação já foi analisada.');

    database.exec('BEGIN');
    try {
      if (decision === 'accepted') {
        database.prepare(`
          INSERT OR IGNORE INTO members (mesa_id, user_id, joined_at) VALUES (?, ?, ?)
        `).run(joinRequest.mesa_id, joinRequest.user_id, Date.now());
      }
      database.prepare(`
        UPDATE requests SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'
      `).run(decision, Date.now(), requestId);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return sendJson(response, 200, { status: decision });
  }

  const removeMemberRoute = pathname.match(/^\/api\/mesas\/([^/]+)\/membros\/([^/]+)$/);
  if (method === 'DELETE' && removeMemberRoute) {
    requireSameOrigin(request);
    const mesaId = decodeParam(removeMemberRoute[1]);
    const memberId = decodeParam(removeMemberRoute[2]);
    const mesa = database.prepare('SELECT owner_id FROM mesas WHERE id = ?').get(mesaId);
    if (!mesa) throw new HttpError(404, 'Mesa não encontrada.');
    const leaving = memberId === user.id;
    if (mesa.owner_id !== user.id && !leaving) {
      throw new HttpError(403, 'Somente o dono da mesa pode remover membros.');
    }
    if (memberId === mesa.owner_id) {
      throw new HttpError(400, 'O dono da mesa não pode ser removido. Exclua a mesa se quiser encerrá-la.');
    }
    database.exec('BEGIN');
    try {
      const result = database.prepare('DELETE FROM members WHERE mesa_id = ? AND user_id = ?')
        .run(mesaId, memberId);
      if (!result.changes) throw new HttpError(404, 'Membro não encontrado nesta mesa.');
      database.prepare(`
        DELETE FROM ficha_mesas
        WHERE mesa_id = ? AND ficha_id IN (SELECT id FROM fichas WHERE user_id = ?)
      `).run(mesaId, memberId);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return sendJson(response, 200, { ok: true });
  }

  throw new HttpError(404, 'Recurso da API não encontrado.');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new HttpError(405, 'Método não permitido.');
    }
    sendStaticFile(request, response, url.pathname);
  } catch (error) {
    if (response.headersSent || response.destroyed) return;
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(response, status, {
      error: status === 500 ? 'Erro interno do servidor.' : error.message
    }, status === 413 ? { Connection: 'close' } : {});
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso. Feche o outro servidor ou use a variável PORT.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

process.on('unhandledRejection', error => {
  console.error('Rejeição não tratada:', error);
});

server.listen(port, host, () => {
  console.log(`Sabi disponível em http://${host}:${port}`);
  console.log(`Banco de dados: ${databasePath}`);
});

function closeServer() {
  setTimeout(() => process.exit(0), 3000).unref();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
