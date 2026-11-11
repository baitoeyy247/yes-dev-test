import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commitRows } from './src/commit.js';
import {
  ROLE_ADMIN,
  ROLE_SUPER,
  countEmailLogs,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  expirePendingInvites,
  getBatch,
  getInviteByTokenHash,
  getProductById,
  getProductByPublicCode,
  getProductBySku,
  getSession,
  getUserByEmail,
  getUserById,
  insertBatch,
  insertEmailLog,
  insertInvite,
  insertScan,
  insertUser,
  listEmailLogs,
  listProducts,
  listUsers,
  markBatchCommitted,
  markInviteAccepted,
  openDatabase,
  recentScans,
  rotateSession,
  scanStats,
  seedSuperAdmin,
  setProductImage,
  setSessionFlash,
  setSessionUser,
  topScanned,
  updateProduct,
} from './src/db.js';
import { parseXlsx } from './src/excel.js';
import { bangkokStartOfDayIso } from './src/format.js';
import { detectImage } from './src/images.js';
import { hashPassword, verifyOrDummy } from './src/password.js';
import { annotateActions } from './src/preview.js';
import { qrPng } from './src/qr.js';
import {
  dashboardPage,
  forbiddenPage,
  homePage,
  importPage,
  invitePage,
  loginPage,
  notFoundPage,
  previewPage,
  productEditPage,
  productsPage,
  publicProductPage,
  scansPage,
  simplePage,
  teamPage,
  unavailablePage,
} from './src/render.js';
import { CATEGORIES, clean, productFromForm, validateRows } from './src/validate.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_LIMIT = 2 * 1024 * 1024;
const EXCEL_LIMIT = 5 * 1024 * 1024;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMAGE_LIMIT } }).single('image');
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: EXCEL_LIMIT } }).single('file');

function runUpload(upload, req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (error) => (error ? reject(error) : resolve()));
  });
}

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[key] = part.slice(index + 1).trim();
    }
  }
  return out;
}

function tokensMatch(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function safeNext(value) {
  if (typeof value !== 'string') return '/admin';
  if (!value.startsWith('/admin') || value.startsWith('//')) return '/admin';
  if (value.includes('..') || value.includes('\\') || value.includes('://') || /\s/.test(value)) return '/admin';
  return value;
}

function clientIp(req) {
  let ip = req.socket?.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip.slice(0, 64);
}

function userAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 500);
}

function baseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function isUniqueError(error) {
  return String(error?.message || '').includes('UNIQUE');
}

function defaultSeed() {
  return {
    name: process.env.SUPER_ADMIN_NAME || 'Luma Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@lumaskin.test',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Luma#Super1',
  };
}

export function createApp(options = {}) {
  const appRoot = options.rootDir || rootDir;
  const dbPath = options.dbPath || path.join(appRoot, 'data', 'luma.db');
  const uploadDir = options.uploadDir || path.join(appRoot, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const db = openDatabase(dbPath);
  deleteExpiredSessions(db);
  const seed = options.seed || defaultSeed();
  const seeded = seedSuperAdmin(db, seed);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '300kb' }));
  app.use('/static', express.static(path.join(appRoot, 'public'), { index: false, maxAge: '1h' }));

  function sendHtml(res, status, html) {
    res.status(status);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', CSP);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    res.send(html);
  }

  function setSessionCookie(res, sid) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `luma_sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
  }

  function clearSessionCookie(res) {
    res.append('Set-Cookie', 'luma_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  }

  function ensureSession(req, res) {
    if (req.session) return req.session;
    const id = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    const session = createSession(db, { id, userId: null, csrf, expiresAt });
    setSessionCookie(res, id);
    req.session = session;
    return session;
  }

  function setFlash(req, type, message) {
    const payload = JSON.stringify({ type, message });
    setSessionFlash(db, req.session.id, payload);
    req.session.flash = payload;
  }

  function popFlash(req) {
    if (!req.session?.flash) return null;
    let parsed = null;
    try {
      parsed = JSON.parse(req.session.flash);
    } catch {
      parsed = null;
    }
    setSessionFlash(db, req.session.id, null);
    req.session.flash = null;
    return parsed;
  }

  function rejectCsrf(res) {
    sendHtml(res, 403, simplePage({
      title: 'คำขอไม่ถูกต้อง',
      message: 'คำขอไม่ถูกต้องหรือหมดอายุ โปรดย้อนกลับแล้วลองใหม่',
    }));
  }

  function checkCsrf(req, res) {
    if (!req.session || !tokensMatch(req.body?.csrf, req.session.csrf)) {
      rejectCsrf(res);
      return false;
    }
    return true;
  }

  function requireLogin(req, res, next) {
    if (!req.user) {
      res.redirect(303, `/login?next=${encodeURIComponent(safeNext(req.originalUrl))}`);
      return;
    }
    next();
  }

  function requireSuper(req, res, next) {
    if (req.user.role !== ROLE_SUPER) {
      sendHtml(res, 403, forbiddenPage({ user: req.user, csrf: req.session.csrf }));
      return;
    }
    next();
  }

  function loadProduct(req, res) {
    const product = getProductById(db, Number(req.params.id));
    if (!product) {
      sendHtml(res, 404, notFoundPage({ user: req.user, csrf: req.session?.csrf || '' }));
      return null;
    }
    return product;
  }

  function findInvite(token) {
    if (!token || token.length < 20 || token.length > 200) return null;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = getInviteByTokenHash(db, tokenHash);
    if (!invite || invite.accepted_at) return null;
    if (invite.expires_at < new Date().toISOString()) return null;
    return invite;
  }

  app.use((req, res, next) => {
    const sid = parseCookies(req).luma_sid;
    if (sid) {
      const session = getSession(db, sid);
      if (session) {
        req.session = session;
        const row = session.user_id ? getUserById(db, session.user_id) : null;
        req.user = row
          ? { id: row.id, name: row.name, email: row.email, role: row.role }
          : null;
      }
    }
    next();
  });

  app.get('/health', (req, res) => {
    res.type('text/plain').send('ok');
  });

  app.get('/', (req, res) => {
    sendHtml(res, 200, homePage({ user: req.user }));
  });

  app.get('/login', (req, res) => {
    const next = safeNext(typeof req.query.next === 'string' ? req.query.next : '/admin');
    if (req.user) {
      res.redirect(303, next);
      return;
    }
    ensureSession(req, res);
    sendHtml(res, 200, loginPage({
      csrf: req.session.csrf,
      next,
      error: '',
      notice: req.query.invited === '1' ? 'ตั้งรหัสผ่านแล้ว เข้าสู่ระบบได้เลย' : '',
      credentials: seed,
    }));
  });

  app.post('/login', (req, res) => {
    ensureSession(req, res);
    if (!checkCsrf(req, res)) return;
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    const row = getUserByEmail(db, email);
    const ok = verifyOrDummy(password, row?.password_hash);
    if (!row || !ok) {
      sendHtml(res, 401, loginPage({
        csrf: req.session.csrf,
        next: safeNext(req.body.next),
        error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
        notice: '',
        credentials: seed,
        email,
      }));
      return;
    }
    const newId = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(32).toString('hex');
    rotateSession(db, req.session.id, newId);
    setSessionUser(db, newId, row.id, csrf);
    setSessionCookie(res, newId);
    req.session = { ...req.session, id: newId, csrf, user_id: row.id };
    res.redirect(303, safeNext(req.body.next));
  });

  app.post('/logout', (req, res) => {
    if (!req.session || !tokensMatch(req.body?.csrf, req.session.csrf)) {
      rejectCsrf(res);
      return;
    }
    deleteSession(db, req.session.id);
    clearSessionCookie(res);
    res.redirect(303, '/login');
  });

  app.get('/admin', requireLogin, (req, res) => {
    sendHtml(res, 200, dashboardPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
      stats: scanStats(db, bangkokStartOfDayIso()),
      top: topScanned(db, 5),
      recent: recentScans(db, 8),
    }));
  });

  app.get('/admin/products', requireLogin, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const category = typeof req.query.category === 'string' && CATEGORIES.includes(req.query.category)
      ? req.query.category
      : '';
    const status = req.query.status === 'active' || req.query.status === 'inactive' ? req.query.status : '';
    sendHtml(res, 200, productsPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
      products: listProducts(db, { q, category, status }),
      filters: { q, category, status },
    }));
  });

  app.get('/admin/products/:id', requireLogin, (req, res) => {
    const product = loadProduct(req, res);
    if (!product) return;
    sendHtml(res, 200, productEditPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
      product,
      values: product,
      errors: [],
      publicUrl: `${baseUrl(req)}/p/${product.public_code}`,
    }));
  });

  app.post('/admin/products/:id', requireLogin, (req, res) => {
    if (!checkCsrf(req, res)) return;
    const product = loadProduct(req, res);
    if (!product) return;
    const parsed = productFromForm(req.body);
    const view = (errors) => productEditPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: null,
      product,
      values: parsed.display,
      errors,
      publicUrl: `${baseUrl(req)}/p/${product.public_code}`,
    });
    if (parsed.errors.length) {
      sendHtml(res, 400, view(parsed.errors));
      return;
    }
    const duplicate = getProductBySku(db, parsed.value.sku);
    if (duplicate && duplicate.id !== product.id) {
      sendHtml(res, 400, view(['SKU นี้มีอยู่แล้ว']));
      return;
    }
    try {
      updateProduct(db, product.id, parsed.value);
    } catch (error) {
      if (isUniqueError(error)) {
        sendHtml(res, 400, view(['SKU นี้มีอยู่แล้ว']));
        return;
      }
      throw error;
    }
    setFlash(req, 'ok', 'บันทึกข้อมูลสินค้าแล้ว QR เดิมยังเปิดหน้านี้ได้และจะแสดงข้อมูลใหม่');
    res.redirect(303, `/admin/products/${product.id}`);
  });

  app.post('/admin/products/:id/image', requireLogin, asyncRoute(async (req, res) => {
    let uploadError = null;
    try {
      await runUpload(imageUpload, req, res);
    } catch (error) {
      uploadError = error;
    }
    if (!checkCsrf(req, res)) return;
    const product = loadProduct(req, res);
    if (!product) return;
    const back = `/admin/products/${product.id}#image`;
    if (uploadError?.code === 'LIMIT_FILE_SIZE') {
      setFlash(req, 'bad', 'ไฟล์ใหญ่เกิน 2 MB');
      res.redirect(303, back);
      return;
    }
    if (uploadError) {
      setFlash(req, 'bad', 'อัปโหลดไฟล์ไม่สำเร็จ');
      res.redirect(303, back);
      return;
    }
    if (!req.file) {
      setFlash(req, 'bad', 'โปรดเลือกไฟล์รูป');
      res.redirect(303, back);
      return;
    }
    const kind = detectImage(req.file.buffer);
    if (!kind) {
      setFlash(req, 'bad', 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
      res.redirect(303, back);
      return;
    }
    const filename = `${product.public_code}.${kind}`;
    for (const ext of ['jpg', 'png', 'webp']) {
      fs.rmSync(path.join(uploadDir, `${product.public_code}.${ext}`), { force: true });
    }
    fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
    setProductImage(db, product.id, filename);
    setFlash(req, 'ok', 'อัปโหลดรูปสินค้าแล้ว');
    res.redirect(303, back);
  }));

  app.post('/admin/products/:id/image/remove', requireLogin, (req, res) => {
    if (!checkCsrf(req, res)) return;
    const product = loadProduct(req, res);
    if (!product) return;
    if (product.image_path) {
      fs.rmSync(path.join(uploadDir, path.basename(product.image_path)), { force: true });
      setProductImage(db, product.id, null);
    }
    setFlash(req, 'ok', 'ลบรูปสินค้าแล้ว');
    res.redirect(303, `/admin/products/${product.id}#image`);
  });

  app.get('/admin/products/:id/qr.png', requireLogin, asyncRoute(async (req, res) => {
    const product = getProductById(db, Number(req.params.id));
    if (!product) {
      res.status(404).end();
      return;
    }
    const buffer = await qrPng(`${baseUrl(req)}/p/${product.public_code}`, {
      background: req.query.bg,
      size: req.query.size,
    });
    const filename = `luma-${String(product.sku).replace(/[^A-Za-z0-9._-]+/g, '_')}-qr.png`;
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.status(200);
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }));

  app.get('/admin/import', requireLogin, (req, res) => {
    sendHtml(res, 200, importPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
    }));
  });

  app.get('/admin/samples/:name', requireLogin, (req, res) => {
    const allow = new Set(['luma_products.xlsx', 'luma_products_update.xlsx']);
    if (!allow.has(req.params.name)) {
      res.status(404).end();
      return;
    }
    res.download(path.join(appRoot, 'sample-data', req.params.name));
  });

  app.post('/admin/import/preview', requireLogin, asyncRoute(async (req, res) => {
    let uploadError = null;
    try {
      await runUpload(excelUpload, req, res);
    } catch (error) {
      uploadError = error;
    }
    if (!checkCsrf(req, res)) return;
    if (uploadError?.code === 'LIMIT_FILE_SIZE') {
      setFlash(req, 'bad', 'ไฟล์ Excel ใหญ่เกิน 5 MB');
      res.redirect(303, '/admin/import');
      return;
    }
    if (uploadError) {
      setFlash(req, 'bad', 'อัปโหลดไฟล์ไม่สำเร็จ');
      res.redirect(303, '/admin/import');
      return;
    }
    const name = req.file?.originalname || '';
    if (!req.file || !name.toLowerCase().endsWith('.xlsx')) {
      setFlash(req, 'bad', 'รองรับเฉพาะไฟล์ .xlsx');
      res.redirect(303, '/admin/import');
      return;
    }
    const parsed = await parseXlsx(req.file.buffer);
    if (parsed.error) {
      setFlash(req, 'bad', parsed.error);
      res.redirect(303, '/admin/import');
      return;
    }
    const rows = annotateActions(validateRows(parsed.rows), (sku) => getProductBySku(db, sku));
    const id = crypto.randomBytes(16).toString('hex');
    insertBatch(db, {
      id,
      userId: req.user.id,
      filename: path.basename(name).slice(0, 180),
      payload: JSON.stringify(rows),
    });
    res.redirect(303, `/admin/import/preview/${id}`);
  }));

  function loadBatch(req, res) {
    if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
      sendHtml(res, 404, notFoundPage({ user: req.user, csrf: req.session.csrf }));
      return null;
    }
    const batch = getBatch(db, req.params.id);
    if (!batch || batch.user_id !== req.user.id) {
      sendHtml(res, 404, notFoundPage({ user: req.user, csrf: req.session.csrf }));
      return null;
    }
    return batch;
  }

  app.get('/admin/import/preview/:id', requireLogin, (req, res) => {
    const batch = loadBatch(req, res);
    if (!batch) return;
    if (batch.committed_at) {
      setFlash(req, 'bad', 'ชุดนี้ถูกบันทึกไปแล้ว');
      res.redirect(303, '/admin/products');
      return;
    }
    const age = Date.now() - new Date(batch.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      setFlash(req, 'bad', 'ชุดตรวจนี้หมดอายุ โปรดอัปโหลดใหม่');
      res.redirect(303, '/admin/import');
      return;
    }
    sendHtml(res, 200, previewPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
      batch,
      rows: JSON.parse(batch.payload),
    }));
  });

  app.post('/admin/import/preview/:id/commit', requireLogin, (req, res) => {
    if (!checkCsrf(req, res)) return;
    const batch = loadBatch(req, res);
    if (!batch) return;
    if (batch.committed_at) {
      setFlash(req, 'bad', 'ชุดนี้ถูกบันทึกไปแล้ว');
      res.redirect(303, '/admin/products');
      return;
    }
    if (req.body.confirm !== 'yes') {
      setFlash(req, 'bad', 'โปรดเปิดดูข้อมูลและยืนยันก่อนบันทึก');
      res.redirect(303, `/admin/import/preview/${batch.id}`);
      return;
    }
    const rows = JSON.parse(batch.payload);
    const valid = rows.filter((row) => row.action === 'create' || row.action === 'update');
    if (!valid.length) {
      setFlash(req, 'bad', 'ไม่มีแถวที่ผ่านการตรวจ จึงยังไม่บันทึก');
      res.redirect(303, `/admin/import/preview/${batch.id}`);
      return;
    }
    for (const row of valid) {
      const existing = getProductBySku(db, row.value.sku);
      if ((row.action === 'update') !== Boolean(existing)) {
        setFlash(req, 'bad', 'ข้อมูลสินค้าเปลี่ยนไประหว่างตรวจ โปรดอัปโหลดและเปิดดูใหม่');
        res.redirect(303, '/admin/import');
        return;
      }
    }
    try {
      const result = commitRows(db, valid);
      markBatchCommitted(db, batch.id);
      setFlash(req, 'ok', `บันทึกแล้ว เพิ่ม ${result.created} รายการ อัปเดต ${result.updated} รายการ QR ของสินค้าเดิมยังใช้ได้`);
      res.redirect(303, '/admin/products');
    } catch (error) {
      if (error.code === 'IMPORT_CONFLICT') {
        setFlash(req, 'bad', 'ข้อมูลสินค้าเปลี่ยนไประหว่างตรวจ โปรดอัปโหลดและเปิดดูใหม่');
        res.redirect(303, '/admin/import');
        return;
      }
      throw error;
    }
  });

  app.get('/admin/scans', requireLogin, (req, res) => {
    sendHtml(res, 200, scansPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
      top: topScanned(db, 10),
      recent: recentScans(db, 100),
    }));
  });

  app.get('/admin/team', requireLogin, requireSuper, (req, res) => {
    sendHtml(res, 200, teamPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: popFlash(req),
      users: listUsers(db),
      logs: listEmailLogs(db, 20),
    }));
  });

  app.post('/admin/team/invite', requireLogin, requireSuper, (req, res) => {
    if (!checkCsrf(req, res)) return;
    const name = clean(req.body.name).replace(/[\r\n]+/g, ' ');
    const email = clean(req.body.email).toLowerCase();
    const errors = [];
    if (!name) errors.push('กรอกชื่อ');
    if (name.length > 80) errors.push('ชื่อยาวเกินไป');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('อีเมลไม่ถูกต้อง');
    const form = { name, email };
    const again = (list) => teamPage({
      user: req.user,
      csrf: req.session.csrf,
      flash: null,
      users: listUsers(db),
      logs: listEmailLogs(db, 20),
      errors: list,
      form,
    });
    if (errors.length) {
      sendHtml(res, 400, again(errors));
      return;
    }
    if (getUserByEmail(db, email)) {
      sendHtml(res, 400, again(['อีเมลนี้มีบัญชีอยู่แล้ว']));
      return;
    }
    expirePendingInvites(db, email);
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    insertInvite(db, {
      name,
      email,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      invitedBy: req.user.id,
      expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
      createdAt: now.toISOString(),
    });
    const link = `${baseUrl(req)}/invite/${token}`;
    const subject = 'คำเชิญเข้าใช้งานระบบ Luma Skin';
    const body = [
      `สวัสดี ${name}`,
      '',
      'คุณได้รับคำเชิญให้เป็น Admin ของระบบสินค้า Luma Skin',
      'เปิดลิงก์นี้เพื่อยืนยันและตั้งรหัสผ่านด้วยตัวเอง ลิงก์มีอายุ 7 วัน',
      link,
      '',
      'หากคุณไม่ได้ขอคำเชิญนี้ ไม่ต้องดำเนินการต่อ',
    ].join('\n');
    insertEmailLog(db, {
      toEmail: email,
      subject,
      body,
      link,
      kind: 'invite',
      createdAt: now.toISOString(),
    });
    setFlash(req, 'ok', 'ส่งคำเชิญแล้ว และบันทึกอีเมลลงบันทึกด้านล่างแทนการส่งจริง');
    res.redirect(303, '/admin/team');
  });

  app.get('/invite/:token', (req, res) => {
    const invite = findInvite(req.params.token);
    if (!invite) {
      sendHtml(res, 400, simplePage({
        title: 'ลิงก์เชิญใช้ไม่ได้',
        message: 'ลิงก์เชิญไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว',
      }));
      return;
    }
    ensureSession(req, res);
    sendHtml(res, 200, invitePage({ csrf: req.session.csrf, invite, errors: [] }));
  });

  app.post('/invite/:token', (req, res) => {
    ensureSession(req, res);
    if (!checkCsrf(req, res)) return;
    const invite = findInvite(req.params.token);
    if (!invite) {
      sendHtml(res, 400, simplePage({
        title: 'ลิงก์เชิญใช้ไม่ได้',
        message: 'ลิงก์เชิญไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว',
      }));
      return;
    }
    const name = clean(req.body.name).replace(/[\r\n]+/g, ' ') || invite.name;
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const errors = [];
    if (!name || name.length > 80) errors.push('กรอกชื่อ');
    if (password.length < 8) errors.push('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    if (password !== confirm) errors.push('รหัสผ่านไม่ตรงกัน');
    if (getUserByEmail(db, invite.email)) errors.push('อีเมลนี้มีบัญชีอยู่แล้ว');
    if (errors.length) {
      sendHtml(res, 400, invitePage({
        csrf: req.session.csrf,
        invite: { ...invite, name },
        errors,
      }));
      return;
    }
    insertUser(db, {
      name,
      email: invite.email,
      passwordHash: hashPassword(password),
      role: ROLE_ADMIN,
    });
    markInviteAccepted(db, invite.id);
    res.redirect(303, '/login?invited=1');
  });

  app.get('/p/:code', (req, res) => {
    const product = getProductByPublicCode(db, req.params.code);
    if (!product || product.status !== 'active') {
      if (product) {
        insertScan(db, {
          productId: product.id,
          ip: clientIp(req),
          userAgent: userAgent(req),
        });
      }
      sendHtml(res, 404, unavailablePage());
      return;
    }
    insertScan(db, {
      productId: product.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    sendHtml(res, 200, publicProductPage(product));
  });

  app.get('/media/:file', (req, res) => {
    const filename = path.basename(req.params.file);
    if (!/^[\w.-]+$/.test(filename)) {
      res.status(404).end();
      return;
    }
    const full = path.resolve(uploadDir, filename);
    const root = path.resolve(uploadDir);
    if (!full.startsWith(`${root}${path.sep}`)) {
      res.status(404).end();
      return;
    }
    if (!fs.existsSync(full)) {
      res.status(404).end();
      return;
    }
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const type = types[path.extname(filename).toLowerCase()];
    if (!type) {
      res.status(404).end();
      return;
    }
    res.set('Content-Type', type);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(full);
  });

  app.use((req, res) => {
    if (req.user) popFlash(req);
    sendHtml(res, 404, notFoundPage({ user: req.user, csrf: req.session?.csrf || '' }));
  });

  app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) {
      next(error);
      return;
    }
    sendHtml(res, 500, simplePage({
      title: 'เกิดข้อผิดพลาด',
      message: 'ระบบทำงานไม่สำเร็จ โปรดลองใหม่',
    }));
  });

  return { app, db, seeded, uploadDir, seed, countEmailLogs: () => countEmailLogs(db) };
}

export function startServer(options = {}) {
  const ctx = createApp(options);
  const host = options.host || process.env.HOST || '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT || 3000);
  return new Promise((resolve) => {
    const server = ctx.app.listen(port, host, () => {
      resolve({ ...ctx, server, port: server.address().port, host });
    });
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const started = await startServer();
  console.log(`Luma Skin พร้อมใช้งานที่ http://127.0.0.1:${started.port}`);
  console.log(`Super Admin: ${started.seed.email} / ${started.seed.password}`);
}
