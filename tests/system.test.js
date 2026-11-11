import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function client(base) {
  const jar = new Map();
  function store(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of list) {
      const pair = line.split(';', 1)[0];
      const index = pair.indexOf('=');
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value || /max-age=0/i.test(line)) jar.delete(key);
      else jar.set(key, decodeURIComponent(value));
    }
  }
  async function req(method, urlPath, { form, formData, headers = {}, raw = false } = {}) {
    const requestHeaders = { ...headers };
    if (jar.size) requestHeaders.cookie = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    let body;
    if (form) {
      body = new URLSearchParams(form);
      requestHeaders['content-type'] = 'application/x-www-form-urlencoded';
    } else if (formData) {
      body = formData;
    }
    const res = await fetch(base + urlPath, { method, headers: requestHeaders, body, redirect: 'manual' });
    store(res);
    const payload = raw ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, headers: res.headers, text: raw ? '' : payload, raw: raw ? payload : null, path: urlPath };
  }
  async function follow(method, urlPath, opts) {
    let currentMethod = method;
    let currentPath = urlPath;
    let currentOpts = opts;
    for (let hop = 0; hop < 6; hop += 1) {
      const res = await req(currentMethod, currentPath, currentOpts);
      if (res.status < 300 || res.status >= 400) return { ...res, path: currentPath };
      const location = res.headers.get('location');
      if (!location) return { ...res, path: currentPath };
      currentMethod = 'GET';
      currentOpts = undefined;
      currentPath = (location.startsWith('http')
        ? `${new URL(location).pathname}${new URL(location).search}`
        : location).split('#')[0];
    }
    throw new Error('too many redirects');
  }
  return { req, follow };
}

function csrfOf(html) {
  const match = html.match(/name="csrf" value="([a-f0-9]+)"/);
  assert.ok(match, 'csrf missing');
  return match[1];
}

function productsOf(html) {
  const rows = [];
  const re = /data-id="(\d+)" data-sku="([^"]*)" data-code="([^"]+)"/g;
  let match = re.exec(html);
  while (match) {
    rows.push({ id: match[1], sku: match[2], code: match[3] });
    match = re.exec(html);
  }
  return rows;
}

function findSku(rows, sku) {
  const found = rows.find((row) => row.sku.toLowerCase() === sku.toLowerCase());
  assert.ok(found, `missing ${sku}`);
  return found;
}

async function login(c, email, password) {
  const page = await c.req('GET', '/login');
  return c.follow('POST', '/login', {
    form: { csrf: csrfOf(page.text), email, password, next: '/admin' },
  });
}

async function uploadExcel(c, filename, buffer) {
  const page = await c.req('GET', '/admin/import');
  const formData = new FormData();
  formData.append('csrf', csrfOf(page.text));
  formData.append('file', new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
  return c.follow('POST', '/admin/import/preview', { formData });
}

describe('Luma Skin flow', { concurrency: 1 }, () => {
  let ctx;
  let base;
  const superUser = client('');
  const admin = client('');

  before(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'luma-'));
    ctx = await startServer({
      host: '127.0.0.1',
      port: 0,
      dbPath: path.join(dir, 'luma.db'),
      uploadDir: path.join(dir, 'uploads'),
      rootDir: root,
      seed: {
        name: 'Luma Super Admin',
        email: 'admin@lumaskin.test',
        password: 'Luma#Super1',
      },
    });
    ctx.dir = dir;
    base = `http://127.0.0.1:${ctx.port}`;
    superUser.base = base;
    admin.base = base;
  });

  after(async () => {
    if (ctx?.server) {
      await new Promise((resolve, reject) => {
        ctx.server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    ctx?.db?.close();
    if (ctx?.dir) await rm(ctx.dir, { recursive: true, force: true });
  });

  test('runs the examiner flow from invite through the second import', { timeout: 120000 }, async () => {
    const bind = (person) => {
      const bound = client(base);
      person.req = bound.req;
      person.follow = bound.follow;
      return bound;
    };
    const owner = bind(superUser);
    const staff = bind(admin);

    const home = await owner.req('GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.text, /Luma/);
    const missing = await owner.req('GET', '/register');
    assert.equal(missing.status, 404);

    const loginPage = await owner.req('GET', '/login');
    assert.match(loginPage.text, /admin@lumaskin.test/);
    assert.match(loginPage.text, /Luma#Super1/);
    assert.equal(loginPage.text.includes('สมัคร'), false);

    const rejected = await login(owner, 'admin@lumaskin.test', 'wrong-password');
    assert.equal(rejected.status, 401);
    assert.match(rejected.text, /อีเมลหรือรหัสผ่านไม่ถูกต้อง/);

    const dashboard = await login(owner, 'admin@lumaskin.test', 'Luma#Super1');
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /สวัสดี/);

    const team = await owner.follow('POST', '/admin/team/invite', {
      form: {
        csrf: csrfOf((await owner.req('GET', '/admin/team')).text),
        name: 'แอดมินทดสอบ',
        email: 'staff@lumaskin.test',
      },
    });
    assert.equal(team.status, 200);
    assert.match(team.text, /บันทึกอีเมล/);
    const link = team.text.match(/https?:\/\/[^"\s]+\/invite\/[A-Za-z0-9_-]+/);
    assert.ok(link, 'invite link missing');
    const invitePath = new URL(link[0]).pathname;

    const guest = client(base);
    const invite = await guest.req('GET', invitePath);
    assert.equal(invite.status, 200);
    const accepted = await guest.follow('POST', invitePath, {
      form: {
        csrf: csrfOf(invite.text),
        name: 'แอดมินทดสอบ',
        password: 'Staff#1234',
        confirm: 'Staff#1234',
      },
    });
    assert.match(accepted.text, /ตั้งรหัสผ่านแล้ว/);

    const staffHome = await login(staff, 'staff@lumaskin.test', 'Staff#1234');
    assert.equal(staffHome.status, 200);
    const forbidden = await staff.req('GET', '/admin/team');
    assert.equal(forbidden.status, 403);
    const dash = await staff.req('GET', '/admin');
    const blocked = await staff.req('POST', '/admin/team/invite', {
      form: { csrf: csrfOf(dash.text), name: 'คนอื่น', email: 'other@lumaskin.test' },
    });
    assert.equal(blocked.status, 403);
    const teamAgain = await owner.req('GET', '/admin/team');
    assert.equal(teamAgain.text.match(/เปิดลิงก์คำเชิญ/g).length, 1);

    const firstFile = await readFile(path.join(root, 'sample-data', 'luma_products.xlsx'));
    const preview = await uploadExcel(staff, 'luma_products.xlsx', firstFile);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /data-total="33"/);
    assert.match(preview.text, /data-create="24"/);
    assert.match(preview.text, /data-update="0"/);
    assert.match(preview.text, /data-reject="9"/);
    for (const message of ['กรอก SKU', 'กรอกชื่อสินค้า', 'ราคาต้องมากกว่า 0', 'ราคาต้องเป็นตัวเลข', 'หมวดหมู่ต้องเป็น', 'สถานะต้องเป็น active หรือ inactive', 'SKU ซ้ำในไฟล์นี้']) {
      assert.match(preview.text, new RegExp(message));
    }
    const beforeSave = await staff.req('GET', '/admin/products');
    assert.match(beforeSave.text, /แสดง 0 รายการ/);

    const batchPath = preview.path;
    const held = await staff.follow('POST', `${batchPath}/commit`, {
      form: { csrf: csrfOf(preview.text), confirm: 'no' },
    });
    assert.match(held.text, /ยืนยันก่อนบันทึก/);
    assert.match((await staff.req('GET', '/admin/products')).text, /แสดง 0 รายการ/);

    const saved = await staff.follow('POST', `${batchPath}/commit`, {
      form: { csrf: csrfOf(held.text), confirm: 'yes' },
    });
    assert.match(saved.text, /เพิ่ม 24 รายการ/);
    assert.match(saved.text, /data-count="24"/);
    let catalog = productsOf(saved.text);
    const cloud = findSku(catalog, 'LS-1001');
    const mineral = findSku(catalog, 'LS-1402');
    const charcoal = findSku(catalog, 'LS-1504');
    const tone = findSku(catalog, 'LS-1403');
    assert.equal(catalog.some((row) => row.sku === 'LS-9001'), false);

    const original = await fetch(`${base}/p/${cloud.code}`, { headers: { 'user-agent': 'LumaScanTest/1.0' } });
    const originalHtml = await original.text();
    assert.equal(original.status, 200);
    assert.match(original.headers.get('cache-control'), /no-store/);
    assert.match(originalHtml, /Luma Cloud Cleanser/);
    assert.equal(originalHtml.includes('สูตรใหม่'), false);
    assert.match(originalHtml, /890/);

    const hidden = await fetch(`${base}/p/${charcoal.code}`);
    const hiddenHtml = await hidden.text();
    assert.equal(hidden.status, 404);
    assert.equal(hiddenHtml.includes('Charcoal'), false);
    const tonePage = await fetch(`${base}/p/${tone.code}`);
    assert.equal(tonePage.status, 200);

    const edit = await staff.req('GET', `/admin/products/${mineral.id}`);
    const edited = await staff.follow('POST', `/admin/products/${mineral.id}`, {
      form: {
        csrf: csrfOf(edit.text),
        sku: 'LS-1402',
        name: 'Luma Mineral SPF50',
        category: 'Sunscreen',
        price: '980',
        size: '40 ml',
        description: 'กันแดดมิเนอรัลสำหรับผิวบอบบาง เกลี่ยแล้วไม่ขาววอก',
        how_to_use: 'ทาปริมาณ 2 ข้อนิ้วทั่วใบหน้า',
        status: 'active',
      },
    });
    assert.match(edited.text, /บันทึกข้อมูลสินค้าแล้ว/);
    assert.match(edited.text, /value="980"/);
    const mineralPublic = await fetch(`${base}/p/${mineral.code}`);
    assert.match(await mineralPublic.text(), /980/);

    const gifData = new FormData();
    gifData.append('csrf', csrfOf(edited.text));
    gifData.append('image', new Blob([gif], { type: 'image/gif' }), 'photo.png');
    const gifRes = await staff.follow('POST', `/admin/products/${cloud.id}/image`, { formData: gifData });
    assert.match(gifRes.text, /รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP/);

    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
    png.copy(big, 0);
    const bigData = new FormData();
    bigData.append('csrf', csrfOf(gifRes.text));
    bigData.append('image', new Blob([big], { type: 'image/png' }), 'big.png');
    const bigRes = await staff.follow('POST', `/admin/products/${cloud.id}/image`, { formData: bigData });
    assert.match(bigRes.text, /ไฟล์ใหญ่เกิน 2 MB/);

    const pngData = new FormData();
    pngData.append('csrf', csrfOf(bigRes.text));
    pngData.append('image', new Blob([png], { type: 'image/png' }), 'cloud.png');
    const pngRes = await staff.follow('POST', `/admin/products/${cloud.id}/image`, { formData: pngData });
    assert.match(pngRes.text, /อัปโหลดรูปสินค้าแล้ว/);
    assert.match(pngRes.text, new RegExp(`/media/${cloud.code}\\.png`));

    const smallQr = await staff.req('GET', `/admin/products/${cloud.id}/qr.png?size=320&bg=%23fffdfb`, { raw: true });
    const largeQr = await staff.req('GET', `/admin/products/${cloud.id}/qr.png?size=1024&bg=%23000000&download=1`, { raw: true });
    assert.equal(smallQr.headers.get('content-type'), 'image/png');
    assert.equal(smallQr.raw[0], 0x89);
    assert.equal(largeQr.headers.get('content-type'), 'image/png');
    assert.match(largeQr.headers.get('content-disposition'), /attachment/);
    assert.ok(largeQr.raw.length > smallQr.raw.length);

    const secondFile = await readFile(path.join(root, 'sample-data', 'luma_products_update.xlsx'));
    const secondPreview = await uploadExcel(staff, 'luma_products_update.xlsx', secondFile);
    assert.match(secondPreview.text, /data-total="18"/);
    assert.match(secondPreview.text, /data-create="4"/);
    assert.match(secondPreview.text, /data-update="7"/);
    assert.match(secondPreview.text, /data-reject="7"/);
    assert.match(secondPreview.text, /LS-1203[\s\S]*-10[\s\S]*ราคาต้องมากกว่า 0/);
    const secondSaved = await staff.follow('POST', `${secondPreview.path}/commit`, {
      form: { csrf: csrfOf(secondPreview.text), confirm: 'yes' },
    });
    assert.match(secondSaved.text, /เพิ่ม 4 รายการ/);
    assert.match(secondSaved.text, /อัปเดต 7 รายการ/);
    assert.match(secondSaved.text, /data-count="28"/);
    catalog = productsOf(secondSaved.text);
    const cloudAfter = findSku(catalog, 'LS-1001');
    assert.equal(cloudAfter.code, cloud.code);
    assert.equal(findSku(catalog, 'LS-1002').code, findSku(productsOf(saved.text), 'LS-1002').code);
    assert.equal(findSku(catalog, 'ls-1002').sku, 'ls-1002');
    for (const sku of ['LS-1601', 'LS-1208', 'LS-1006', 'LS-1306']) findSku(catalog, sku);
    assert.equal(catalog.some((row) => row.sku === 'LS-9090'), false);

    const cloudEdit = await staff.req('GET', `/admin/products/${cloudAfter.id}`);
    assert.match(cloudEdit.text, /สูตรใหม่/);
    assert.match(cloudEdit.text, /value="940"/);
    assert.match(cloudEdit.text, /เนื้อเจลเนียนขึ้น/);
    assert.match(cloudEdit.text, new RegExp(`/media/${cloud.code}\\.png`));
    const cloudPublic = await fetch(`${base}/p/${cloud.code}`, { headers: { 'user-agent': 'LumaScanTest/1.0' } });
    const cloudHtml = await cloudPublic.text();
    assert.equal(cloudPublic.status, 200);
    assert.match(cloudHtml, /สูตรใหม่/);
    assert.match(cloudHtml, /940/);
    assert.match(cloudHtml, /เนื้อเจลเนียนขึ้น/);
    assert.match(cloudHtml, new RegExp(`/media/${cloud.code}\\.png`));

    const mineralStill = await staff.req('GET', `/admin/products/${mineral.id}`);
    assert.match(mineralStill.text, /value="980"/);
    const cica = findSku(catalog, 'LS-1203');
    const cicaPage = await staff.req('GET', `/admin/products/${cica.id}`);
    assert.match(cicaPage.text, /value="1390"/);
    assert.match(cicaPage.text, /ใบบัวบก/);
    assert.equal(cicaPage.text.includes('ไม่ควรถูกบันทึก'), false);
    const peptide = findSku(catalog, 'LS-1204');
    const peptidePublic = await fetch(`${base}/p/${peptide.code}`);
    assert.equal(peptidePublic.status, 404);
    assert.equal((await peptidePublic.text()).includes('Peptide'), false);
    const dew = await staff.req('GET', `/admin/products/${findSku(catalog, 'LS-1101').id}`);
    assert.match(dew.text, /value="200 ml"/);

    const sunscreen = await staff.req('GET', '/admin/products?category=Sunscreen');
    assert.match(sunscreen.text, /Luma Mineral SPF50/);
    assert.equal(sunscreen.text.includes('Luma Cloud Cleanser'), false);
    await fetch(`${base}/p/${cloud.code}`, { headers: { 'user-agent': 'LumaScanTest/1.0' } });
    const scans = await staff.req('GET', '/admin/scans');
    assert.match(scans.text, /LumaScanTest\/1\.0/);
    assert.match(scans.text, /127\.0\.0\.1/);
    assert.match(scans.text, /data-top="LS-1001,/);
  });
});
