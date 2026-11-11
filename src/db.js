import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './password.js';

export const ROLE_SUPER = 'Super Admin';
export const ROLE_ADMIN = 'Admin';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Super Admin', 'Admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  flash TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_code TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  price REAL NOT NULL,
  size TEXT,
  description TEXT,
  how_to_use TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  image_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  scanned_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_product ON scan_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_scan_time ON scan_logs(scanned_at);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  committed_at TEXT
);
`;

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.prepare('PRAGMA foreign_keys = ON').run();
  db.prepare('PRAGMA journal_mode = WAL').get();
  db.prepare('PRAGMA busy_timeout = 3000').run();
  db.exec(SCHEMA);
  return db;
}

export function seedSuperAdmin(db, { name, email, password }) {
  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) return { created: false };
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email.toLowerCase(), hashPassword(password), ROLE_SUPER, now);
  return { created: true, id: Number(info.lastInsertRowid) };
}

export function getUserById(db, id) {
  return db.prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE id = ?').get(id) || null;
}

export function getUserByEmail(db, email) {
  return db.prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?').get(email) || null;
}

export function listUsers(db) {
  return db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC').all();
}

export function insertUser(db, { name, email, passwordHash, role }) {
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email.toLowerCase(), passwordHash, role, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function createSession(db, { id, userId, csrf, expiresAt }) {
  db.prepare(`
    INSERT INTO sessions (id, user_id, csrf, flash, expires_at)
    VALUES (?, ?, ?, NULL, ?)
  `).run(id, userId ?? null, csrf, expiresAt);
  return getSession(db, id);
}

export function getSession(db, id) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  return row;
}

export function setSessionFlash(db, id, flash) {
  db.prepare('UPDATE sessions SET flash = ? WHERE id = ?').run(flash, id);
}

export function setSessionUser(db, id, userId, csrf) {
  db.prepare('UPDATE sessions SET user_id = ?, csrf = ? WHERE id = ?').run(userId, csrf, id);
}

export function rotateSession(db, oldId, newId) {
  db.prepare('UPDATE sessions SET id = ? WHERE id = ?').run(newId, oldId);
}

export function deleteSession(db, id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function deleteExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

export function expirePendingInvites(db, email) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE invites
    SET expires_at = ?
    WHERE email = ? AND accepted_at IS NULL AND expires_at > ?
  `).run(new Date(0).toISOString(), email.toLowerCase(), now);
}

export function insertInvite(db, invite) {
  db.prepare(`
    INSERT INTO invites (name, email, token_hash, invited_by, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    invite.name,
    invite.email.toLowerCase(),
    invite.tokenHash,
    invite.invitedBy,
    invite.expiresAt,
    invite.createdAt,
  );
}

export function getInviteByTokenHash(db, tokenHash) {
  return db.prepare('SELECT * FROM invites WHERE token_hash = ?').get(tokenHash) || null;
}

export function markInviteAccepted(db, id) {
  db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function insertEmailLog(db, entry) {
  db.prepare(`
    INSERT INTO email_logs (to_email, subject, body, link, kind, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.toEmail, entry.subject, entry.body, entry.link || null, entry.kind, entry.createdAt);
}

export function listEmailLogs(db, limit = 20) {
  return db.prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT ?').all(limit);
}

export function countEmailLogs(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM email_logs').get().n;
}

function newPublicCode() {
  return crypto.randomBytes(9).toString('base64url');
}

export function insertProduct(db, fields) {
  const now = new Date().toISOString();
  let publicCode = newPublicCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = db.prepare('SELECT 1 AS ok FROM products WHERE public_code = ?').get(publicCode);
    if (!taken) break;
    publicCode = newPublicCode();
  }
  const info = db.prepare(`
    INSERT INTO products (
      public_code, sku, name, category, price, size, description, how_to_use, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    publicCode,
    fields.sku,
    fields.name,
    fields.category,
    fields.price,
    fields.size,
    fields.description,
    fields.how_to_use,
    fields.status,
    now,
    now,
  );
  return getProductById(db, Number(info.lastInsertRowid));
}

export function updateProduct(db, id, fields) {
  db.prepare(`
    UPDATE products SET
      sku = ?,
      name = ?,
      category = ?,
      price = ?,
      size = ?,
      description = ?,
      how_to_use = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    fields.sku,
    fields.name,
    fields.category,
    fields.price,
    fields.size,
    fields.description,
    fields.how_to_use,
    fields.status,
    new Date().toISOString(),
    id,
  );
}

export function setProductImage(db, id, imagePath) {
  db.prepare('UPDATE products SET image_path = ?, updated_at = ? WHERE id = ?')
    .run(imagePath, new Date().toISOString(), id);
}

export function getProductById(db, id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) || null;
}

export function getProductBySku(db, sku) {
  return db.prepare('SELECT * FROM products WHERE sku = ?').get(sku) || null;
}

export function getProductByPublicCode(db, code) {
  return db.prepare('SELECT * FROM products WHERE public_code = ?').get(code) || null;
}

export function listProducts(db, { q = '', category = '', status = '' } = {}) {
  const query = q.trim();
  const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM scan_logs s WHERE s.product_id = p.id) AS scan_count
    FROM products p
    WHERE (? = '' OR p.sku LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')
      AND (? = '' OR IFNULL(p.category, '') = ?)
      AND (? = '' OR p.status = ?)
    ORDER BY p.sku COLLATE NOCASE ASC, p.id ASC
  `).all(query, like, like, category, category, status, status);
}

export function countProducts(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
}

export function insertScan(db, { productId, ip, userAgent }) {
  db.prepare(`
    INSERT INTO scan_logs (product_id, scanned_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `).run(productId, new Date().toISOString(), ip || null, userAgent || null);
}

export function scanStats(db, sinceIso) {
  return {
    total: db.prepare('SELECT COUNT(*) AS n FROM scan_logs').get().n,
    today: db.prepare('SELECT COUNT(*) AS n FROM scan_logs WHERE scanned_at >= ?').get(sinceIso).n,
    products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
    active: db.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'active'").get().n,
  };
}

export function topScanned(db, limit = 5) {
  return db.prepare(`
    SELECT p.id, p.name, p.sku, p.public_code, p.status, p.category, COUNT(s.id) AS scan_count
    FROM scan_logs s
    JOIN products p ON p.id = s.product_id
    GROUP BY p.id
    ORDER BY scan_count DESC, p.name COLLATE NOCASE ASC
    LIMIT ?
  `).all(limit);
}

export function recentScans(db, limit = 50) {
  return db.prepare(`
    SELECT s.id, s.scanned_at, s.ip_address, s.user_agent,
           p.id AS product_id, p.name AS product_name, p.sku, p.public_code, p.status
    FROM scan_logs s
    JOIN products p ON p.id = s.product_id
    ORDER BY s.scanned_at DESC, s.id DESC
    LIMIT ?
  `).all(limit);
}

export function insertBatch(db, { id, userId, filename, payload }) {
  db.prepare(`
    INSERT INTO import_batches (id, user_id, filename, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, filename, payload, new Date().toISOString());
}

export function getBatch(db, id) {
  return db.prepare('SELECT * FROM import_batches WHERE id = ?').get(id) || null;
}

export function markBatchCommitted(db, id) {
  db.prepare('UPDATE import_batches SET committed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}
