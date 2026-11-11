import { CATEGORIES, COLUMN_HELP, clean } from './validate.js';
import { clip, formatPrice, formatWhen, priceInput } from './format.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function safeHref(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function htmlPage({ title, bodyClass, content, scripts = [] }) {
  const scriptTags = scripts.map((src) => `<script src="${esc(src)}" defer></script>`).join('');
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#241c18">
<title>${esc(title)}</title>
<link rel="icon" href="/static/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/app.css">
</head>
<body class="${esc(bodyClass)}">
${content}
${scriptTags}
</body>
</html>`;
}

function wordmark() {
  return `<span class="mark" aria-hidden="true"></span><span class="brand-name"><span class="latin">Luma</span> Skin</span>`;
}

function banner(flash) {
  if (!flash?.message) return '';
  const kind = flash.type === 'ok' ? 'ok' : 'bad';
  return `<div class="banner banner-${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${esc(flash.message)}</div>`;
}

function errorList(errors) {
  if (!errors?.length) return '';
  return `<div class="banner banner-bad" role="alert"><ul>${errors.map((error) => `<li>${esc(error)}</li>`).join('')}</ul></div>`;
}

function pageHead(kicker, title, lede = '') {
  return `<header class="page-head"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</div></header>`;
}

function layout({ title, user, active, csrf, flash, content, scripts = [] }) {
  const items = [
    ['/admin', 'ภาพรวม', 'home'],
    ['/admin/products', 'สินค้า', 'products'],
    ['/admin/import', 'นำเข้า', 'import'],
    ['/admin/scans', 'การสแกน', 'scans'],
  ];
  if (user?.role === 'Super Admin') items.push(['/admin/team', 'ทีมงาน', 'team']);
  const links = items.map(([href, label, key]) => {
    const current = key === active ? ' class="active" aria-current="page"' : '';
    return `<a href="${href}"${current}>${label}</a>`;
  }).join('');
  return htmlPage({
    title: `${title} · Luma Skin`,
    bodyClass: 'app',
    scripts,
    content: `<div class="shell">
      <aside class="side">
        <a class="brand" href="/admin">${wordmark()}</a>
        <nav>${links}</nav>
        <div class="me">
          <strong>${esc(user.name)}</strong>
          <span>${esc(user.role)}</span>
          <form method="post" action="/logout">
            <input type="hidden" name="csrf" value="${esc(csrf)}">
            <button class="text" type="submit">ออกจากระบบ</button>
          </form>
        </div>
      </aside>
      <main class="main" id="content">
        ${banner(flash)}
        ${content}
      </main>
    </div>`,
  });
}

function statusBadge(status) {
  if (status === 'active') return '<span class="badge badge-on"><span class="badge-key">active · </span>แสดง</span>';
  return '<span class="badge badge-off"><span class="badge-key">inactive · </span>ไม่แสดง</span>';
}

function scanTable(scans) {
  if (!scans.length) return '<p class="muted">ยังไม่มีบันทึกการเปิดหน้าสินค้า</p>';
  const rows = scans.map((scan) => `<tr>
    <td>${esc(formatWhen(scan.scanned_at))}</td>
    <td><a href="/admin/products/${scan.product_id}">${esc(scan.product_name)}</a><div class="sku">${esc(scan.sku)}</div></td>
    <td>${statusBadge(scan.status)}</td>
    <td class="sku">${esc(scan.ip_address || '')}</td>
    <td title="${esc(scan.user_agent || '')}">${esc(clip(scan.user_agent || '', 72))}</td>
  </tr>`).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>เวลา</th><th>สินค้า</th><th>สถานะ</th><th>IP</th><th>User agent</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function rankList(items) {
  if (!items.length) return '<p class="muted">ยังไม่มีการสแกน เปิดหน้าสินค้าสาธารณะเพื่อทดลอง</p>';
  const max = Math.max(...items.map((item) => Number(item.scan_count)));
  const rows = items.map((item) => {
    const width = Math.max(8, Math.round((Number(item.scan_count) / max) * 100));
    return `<li class="rank">
      <div class="rank-top"><a href="/admin/products/${item.id}">${esc(item.name)}</a><b>${Number(item.scan_count)}</b></div>
      <div class="bar" aria-hidden="true"><span style="width:${width}%"></span></div>
      <span class="sku">${esc(item.sku)}</span>
    </li>`;
  }).join('');
  return `<ol class="ranks" data-top="${esc(items.map((item) => item.sku).join(','))}">${rows}</ol>`;
}

export function homePage({ user }) {
  const href = user ? '/admin' : '/login';
  const label = user ? 'ไปที่ระบบหลังบ้าน' : 'เข้าสู่ระบบทีมงาน';
  return htmlPage({
    title: 'Luma Skin',
    bodyClass: 'public',
    content: `<main class="home">
      <p class="brand-line">${wordmark()}</p>
      <p class="eyebrow">Skincare labels</p>
      <h1>สแกน QR บนบรรจุภัณฑ์ แล้วเห็นข้อมูลสินค้าล่าสุด</h1>
      <p class="lede">แต่ละสินค้ามี QR ของตัวเอง ทีมงานแก้ชื่อ ราคา หรือวิธีใช้เมื่อไร ลิงก์ที่พิมพ์ไปแล้วก็ยังเปิดหน้าเดิมและแสดงข้อมูลใหม่</p>
      <p class="actions"><a class="button" href="${href}">${label}</a></p>
    </main>`,
  });
}

export function loginPage({ csrf, next, error, notice, credentials, email = '' }) {
  return htmlPage({
    title: 'เข้าสู่ระบบ · Luma Skin',
    bodyClass: 'auth',
    content: `<main class="auth-shell">
      <section class="auth-copy">
        <p class="brand-line">${wordmark()}</p>
        <h1>ข้อมูลสินค้า ที่อัปเดตตาม QR</h1>
        <p>สำหรับทีม Luma Skin เท่านั้น</p>
      </section>
      <section class="auth-card">
        <p class="eyebrow">ทีมงาน</p>
        <h2>เข้าสู่ระบบ</h2>
        ${error ? `<div class="banner banner-bad" role="alert">${esc(error)}</div>` : ''}
        ${notice ? `<div class="banner banner-ok" role="status">${esc(notice)}</div>` : ''}
        <form method="post" action="/login">
          <input type="hidden" name="csrf" value="${esc(csrf)}">
          <input type="hidden" name="next" value="${esc(next)}">
          <label class="field"><span>อีเมล</span><input name="email" type="email" autocomplete="username" required value="${esc(email)}"></label>
          <label class="field"><span>รหัสผ่าน</span><input name="password" type="password" autocomplete="current-password" required></label>
          <button class="primary" type="submit">เข้าสู่ระบบ</button>
        </form>
        <aside class="demo">
          <p>บัญชีสำหรับผู้ทดสอบ</p>
          <dl>
            <div><dt>บทบาท</dt><dd>Super Admin</dd></div>
            <div><dt>อีเมล</dt><dd><code>${esc(credentials.email)}</code></dd></div>
            <div><dt>รหัสผ่าน</dt><dd><code>${esc(credentials.password)}</code></dd></div>
          </dl>
        </aside>
      </section>
    </main>`,
  });
}

export function dashboardPage({ user, csrf, flash, stats, top, recent }) {
  const content = `
    ${pageHead('ภาพรวม', `สวัสดี ${user.name}`, 'จัดการสินค้า QR และการสแกนของ Luma Skin')}
    <section class="stats" data-products="${stats.products}" data-active="${stats.active}" data-scans="${stats.total}" data-today="${stats.today}">
      <article class="stat"><span>สินค้าทั้งหมด</span><b>${stats.products}</b></article>
      <article class="stat"><span>กำลังแสดง</span><b>${stats.active}</b></article>
      <article class="stat"><span>สแกนทั้งหมด</span><b>${stats.total}</b></article>
      <article class="stat"><span>สแกนวันนี้</span><b>${stats.today}</b></article>
    </section>
    <section class="panel">
      <h2>ลำดับทดสอบที่แนะนำ</h2>
      <ol class="steps">
        <li>Super Admin เข้าสู่ระบบด้วยบัญชีด้านบนของหน้าล็อกอิน</li>
        <li>ส่งคำเชิญให้ Admin ที่เมนูทีมงาน แล้วเปิดลิงก์จากบันทึกอีเมล เพื่อให้ผู้ถูกเชิญตั้งรหัสผ่านเอง</li>
        <li>นำเข้า <span class="sku">luma_products.xlsx</span> เปิดดูแถวที่ไม่ผ่าน แล้วยืนยันบันทึกเฉพาะแถวที่ถูกต้อง</li>
        <li>เปิด QR ของสินค้า เปลี่ยนสีพื้นหลังกับขนาด แล้วดาวน์โหลดเป็นรูป</li>
        <li>แก้ข้อมูลสินค้า แล้วเปิดลิงก์เดิมซ้ำ หน้าสาธารณะต้องแสดงข้อมูลใหม่</li>
        <li>นำเข้า <span class="sku">luma_products_update.xlsx</span> เพื่ออัปเดตของเดิม เพิ่มของใหม่ และตรวจว่า QR เดิมยังใช้ได้</li>
      </ol>
    </section>
    <div class="split">
      <section class="panel">
        <h2>สินค้าที่ถูกดูมากที่สุด</h2>
        ${rankList(top)}
      </section>
      <section class="panel">
        <h2>การสแกนล่าสุด</h2>
        ${scanTable(recent)}
        <p class="actions"><a class="button ghost" href="/admin/scans">ดูบันทึกทั้งหมด</a></p>
      </section>
    </div>`;
  return layout({ title: 'ภาพรวม', user, csrf, active: 'home', flash, content });
}

export function productsPage({ user, csrf, flash, products, filters }) {
  const categoryOptions = ['', ...CATEGORIES].map((item) => {
    const label = item || 'ทุกหมวด';
    const selected = filters.category === item ? ' selected' : '';
    return `<option value="${esc(item)}"${selected}>${label}</option>`;
  }).join('');
  const statusOptions = [
    ['', 'ทุกสถานะ'],
    ['active', 'active · แสดง'],
    ['inactive', 'inactive · ไม่แสดง'],
  ].map(([value, label]) => `<option value="${value}"${filters.status === value ? ' selected' : ''}>${label}</option>`).join('');
  const rows = products.map((product) => `<tr data-id="${product.id}" data-sku="${esc(product.sku)}" data-code="${esc(product.public_code)}">
    <td>${product.image_path ? `<img class="thumb" src="/media/${esc(product.image_path)}?v=${esc(product.updated_at)}" alt="">` : '<span class="thumb thumb-empty"></span>'}</td>
    <td class="sku">${esc(product.sku)}</td>
    <td><a href="/admin/products/${product.id}">${esc(product.name)}</a></td>
    <td>${esc(product.category || '—')}</td>
    <td class="num">${esc(formatPrice(product.price))}</td>
    <td>${statusBadge(product.status)}</td>
    <td class="num">${Number(product.scan_count)}</td>
    <td><a href="/admin/products/${product.id}#qr">QR</a></td>
  </tr>`).join('');
  const table = products.length
    ? `<div class="table-wrap"><table class="products" data-count="${products.length}">
        <thead><tr><th></th><th>SKU</th><th>สินค้า</th><th>หมวด</th><th>ราคา</th><th>สถานะ</th><th>สแกน</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
    : `<div class="empty"><p>ยังไม่มีสินค้า เริ่มจากนำเข้าไฟล์ Excel</p><a class="button" href="/admin/import">ไปหน้านำเข้า</a></div>`;
  const content = `
    ${pageHead('สินค้า', 'รายการสินค้า', 'แก้ข้อมูลได้จากแถวสินค้า QR ที่สร้างตอนนำเข้าจะยังชี้มาที่หน้าเดิม')}
    <form class="filters" method="get" action="/admin/products">
      <label class="field"><span>ค้นหา</span><input type="search" name="q" value="${esc(filters.q)}" placeholder="ชื่อหรือ SKU"></label>
      <label class="field"><span>หมวด</span><select name="category">${categoryOptions}</select></label>
      <label class="field"><span>สถานะ</span><select name="status">${statusOptions}</select></label>
      <button class="primary" type="submit">กรอง</button>
    </form>
    <p class="muted">แสดง ${products.length} รายการ</p>
    <section class="panel">${table}</section>`;
  return layout({ title: 'สินค้า', user, csrf, active: 'products', flash, content });
}

function categorySelect(current) {
  const value = current || '';
  const extra = value && !CATEGORIES.includes(value)
    ? `<option value="${esc(value)}" selected>${esc(value)}</option>`
    : '';
  return `<select name="category">
    <option value=""${value === '' ? ' selected' : ''}>ไม่ระบุ</option>
    ${extra}
    ${CATEGORIES.map((item) => `<option value="${item}"${item === value ? ' selected' : ''}>${item}</option>`).join('')}
  </select>`;
}

function statusSelect(current) {
  const text = current || 'active';
  const extra = text === 'active' || text === 'inactive' ? '' : `<option value="${esc(text)}" selected>${esc(text)}</option>`;
  return `<select name="status">
    <option value="active"${text === 'active' ? ' selected' : ''}>active · แสดงบนหน้าสาธารณะ</option>
    <option value="inactive"${text === 'inactive' ? ' selected' : ''}>inactive · ไม่แสดงบนหน้าสาธารณะ</option>
    ${extra}
  </select>`;
}

export function productEditPage({ user, csrf, flash, product, values, errors, publicUrl }) {
  const price = typeof values.price === 'number' ? priceInput(values.price) : String(values.price ?? '');
  const image = product.image_path
    ? `<img id="image-current" class="hero" src="/media/${esc(product.image_path)}?v=${esc(product.updated_at)}" alt="${esc(product.name)}">`
    : '<div class="hero hero-empty" id="image-current"><span class="latin">Luma</span><small>ยังไม่มีรูปสินค้า</small></div>';
  const remove = product.image_path
    ? `<form method="post" action="/admin/products/${product.id}/image/remove">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <button class="ghost" type="submit">ลบรูป</button>
      </form>`
    : '';
  const content = `
    <p class="back"><a href="/admin/products">← รายการสินค้า</a></p>
    ${pageHead(product.sku, product.name, 'QR ที่พิมพ์แล้วชี้มาที่ลิงก์ถาวรนี้')}
    <section class="panel" id="image">
      <h2>รูปสินค้า</h2>
      <ul class="rules">
        <li>1 รูปหลักต่อสินค้า</li>
        <li>JPG, PNG หรือ WEBP</li>
        <li>ขนาดไม่เกิน 2 MB</li>
        <li>สัดส่วนที่แนะนำคือสี่เหลี่ยมจัตุรัส ประมาณ 800×800 px</li>
      </ul>
      ${image}
      <p id="image-note" class="hint">ไฟล์ที่ไม่เข้าเงื่อนไขจะถูกปฏิเสธพร้อมบอกเหตุผล</p>
      <form class="upload" method="post" action="/admin/products/${product.id}/image" enctype="multipart/form-data">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <label class="file-pick">
          <input id="image-file" name="image" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">
          <span>เลือกไฟล์รูป</span>
        </label>
        <p class="file-chosen" data-empty="ยังไม่ได้เลือกไฟล์">ยังไม่ได้เลือกไฟล์</p>
        <button class="primary" type="submit">อัปโหลดรูป</button>
      </form>
      ${remove}
    </section>
    <section class="panel">
      <h2>ข้อมูลสินค้า</h2>
      ${errorList(errors)}
      <form method="post" action="/admin/products/${product.id}" class="form-grid">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <label class="field"><span>SKU</span><input name="sku" required maxlength="80" autocomplete="off" value="${esc(values.sku || '')}"></label>
        <label class="field"><span>ชื่อสินค้า</span><input name="name" required maxlength="200" value="${esc(values.name || '')}"></label>
        <label class="field"><span>หมวดหมู่</span>${categorySelect(values.category)}</label>
        <label class="field"><span>ราคา (บาท)</span><input name="price" inputmode="decimal" autocomplete="off" required value="${esc(price)}"></label>
        <label class="field"><span>ขนาด</span><input name="size" maxlength="80" value="${esc(values.size || '')}" placeholder="30 ml, 50 g"></label>
        <label class="field"><span>สถานะ</span>${statusSelect(values.status)}</label>
        <label class="field wide"><span>รายละเอียด</span><textarea name="description" maxlength="5000">${esc(values.description || '')}</textarea></label>
        <label class="field wide"><span>วิธีใช้</span><textarea name="how_to_use" maxlength="5000">${esc(values.how_to_use || '')}</textarea></label>
        <div class="actions"><button class="primary" type="submit">บันทึกข้อมูล</button></div>
      </form>
    </section>
    <section class="panel" id="qr">
      <h2>QR Code</h2>
      <p class="lede">เปลี่ยนสีพื้นหลังและขนาดได้ก่อนดาวน์โหลด รูป QR ชี้ไปที่ลิงก์สาธารณะถาวร จึงยังใช้ได้หลังแก้ข้อมูลหรือนำเข้าทับ</p>
      <div class="qr-grid">
        <img id="qr-preview" alt="ตัวอย่าง QR" data-src="/admin/products/${product.id}/qr.png" src="/admin/products/${product.id}/qr.png?bg=%23fffdfb&amp;size=512">
        <div class="qr-controls">
          <label class="field"><span>สีพื้นหลัง</span><input id="qr-bg" type="color" value="#fffdfb"></label>
          <label class="field"><span>ขนาด</span>
            <select id="qr-size">
              <option value="320">เล็ก 320 px</option>
              <option value="512" selected>กลาง 512 px</option>
              <option value="800">ใหญ่ 800 px</option>
              <option value="1024">ใหญ่พิเศษ 1024 px</option>
            </select>
          </label>
          <a class="button" id="qr-download" href="/admin/products/${product.id}/qr.png?bg=%23fffdfb&amp;size=512&amp;download=1">ดาวน์โหลด PNG</a>
          <label class="field"><span>ลิงก์สาธารณะ</span><input id="public-url" type="text" readonly value="${esc(publicUrl)}"></label>
          <p class="actions"><a class="button ghost" href="/p/${esc(product.public_code)}" target="_blank" rel="noopener">เปิดหน้าสาธารณะ (นับเป็นการสแกน)</a></p>
          <button class="ghost" id="copy-link" type="button" data-link="${esc(publicUrl)}">คัดลอกลิงก์</button>
        </div>
      </div>
    </section>`;
  return layout({
    title: product.name,
    user,
    csrf,
    active: 'products',
    flash,
    content,
    scripts: ['/static/js/file.js', '/static/js/qr.js', '/static/js/image.js'],
  });
}

export function importPage({ user, csrf, flash }) {
  const content = `
    ${pageHead('นำเข้า', 'นำเข้าสินค้าจาก Excel', 'ระบบเปิดให้ตรวจทุกแถวก่อนเขียนลงฐานข้อมูล แถวที่ไม่ผ่านจะไม่ถูกบันทึก')}
    <section class="file-cards">
      <a class="file-card" href="/admin/samples/luma_products.xlsx">
        <strong class="sku">luma_products.xlsx</strong>
        <span>นำเข้าครั้งแรก ประมาณ 30 แถว มีบางแถวที่ตั้งใจให้ข้อมูลผิด</span>
      </a>
      <a class="file-card" href="/admin/samples/luma_products_update.xlsx">
        <strong class="sku">luma_products_update.xlsx</strong>
        <span>นำเข้าครั้งที่สอง หลังมี QR แล้ว ใช้ทดสอบการอัปเดตของเดิมและเพิ่มของใหม่</span>
      </a>
    </section>
    <section class="panel">
      <form method="post" action="/admin/import/preview" enctype="multipart/form-data" class="upload">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <label class="file-pick">
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required>
          <span>เลือกไฟล์ .xlsx</span>
        </label>
        <p class="file-chosen" data-empty="ยังไม่ได้เลือกไฟล์">ยังไม่ได้เลือกไฟล์</p>
        <button class="primary" type="submit">ตรวจไฟล์</button>
      </form>
    </section>
    <section class="panel">
      <h2>รูปแบบคอลัมน์</h2>
      <div class="table-wrap"><table class="spec">
        <thead><tr><th>คอลัมน์</th><th>บังคับ</th><th>ประเภท</th><th>เงื่อนไข</th></tr></thead>
        <tbody>${COLUMN_HELP.map(([name, required, type, note]) => `<tr><td class="sku">${esc(name)}</td><td>${esc(required)}</td><td>${esc(type)}</td><td>${esc(note)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  return layout({ title: 'นำเข้า', user, csrf, active: 'import', flash, content, scripts: ['/static/js/file.js'] });
}

function previewValue(row, field) {
  if (row.value && row.action !== 'reject') {
    const value = row.value[field];
    if (value == null || value === '') return '<span class="muted">—</span>';
    if (field === 'price') return esc(formatPrice(value));
    return esc(String(value));
  }
  const raw = row.raw?.[field];
  if (raw == null || raw === '') return '<span class="muted">—</span>';
  return esc(String(raw));
}

function previewDetail(row) {
  if (row.errors?.length) return esc(row.errors.join(' · '));
  const notes = [];
  if (row.action === 'create') notes.push('จะเพิ่มสินค้าใหม่');
  else if (!row.changes?.length) notes.push('ข้อมูลเดิม ไม่มีการเปลี่ยนแปลง');
  else {
    notes.push(row.changes.map((change) => {
      const from = clip(change.from || 'ว่าง', 80);
      const to = clip(change.to || 'ว่าง', 80);
      return `${change.label}: ${from} → ${to}`;
    }).join(' · '));
  }
  if (!clean(row.raw?.status)) notes.push('สถานะว่าง จะบันทึกเป็น active');
  return esc(notes.join(' · '));
}

function previewBadge(row) {
  if (row.action === 'reject') return '<span class="badge badge-off">ไม่ผ่าน</span>';
  if (row.action === 'create') return '<span class="badge badge-new">เพิ่มใหม่</span>';
  return '<span class="badge badge-edit">อัปเดต</span>';
}

export function previewPage({ user, csrf, flash, batch, rows }) {
  const creates = rows.filter((row) => row.action === 'create').length;
  const updates = rows.filter((row) => row.action === 'update').length;
  const rejects = rows.filter((row) => row.action === 'reject').length;
  const body = rows.map((row) => `<tr class="${row.action === 'reject' ? 'row-bad' : ''}">
    <td class="num">${row.rowNumber}</td>
    <td class="sku">${previewValue(row, 'sku')}</td>
    <td>${previewValue(row, 'name')}</td>
    <td>${previewValue(row, 'category')}</td>
    <td>${previewValue(row, 'price')}</td>
    <td>${previewValue(row, 'status')}</td>
    <td>${previewBadge(row)}</td>
    <td>${previewDetail(row)}</td>
  </tr>`).join('');
  const commit = creates + updates > 0
    ? `<form method="post" action="/admin/import/preview/${esc(batch.id)}/commit" class="confirm">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <label class="check"><input type="checkbox" name="confirm" value="yes" required> ฉันเปิดดูข้อมูลแล้ว และยืนยันให้บันทึกเฉพาะแถวที่ผ่านการตรวจ</label>
        <div class="actions">
          <button class="primary" type="submit">บันทึกข้อมูล</button>
          <a class="button ghost" href="/admin/import">เลือกไฟล์ใหม่</a>
        </div>
      </form>`
    : `<div class="banner banner-bad" role="alert">ไม่มีแถวที่ผ่านการตรวจ จึงยังบันทึกไม่ได้</div><p class="actions"><a class="button ghost" href="/admin/import">เลือกไฟล์ใหม่</a></p>`;
  const content = `
    ${pageHead('ตรวจก่อนบันทึก', batch.filename, 'เลื่อนดูทุกแถว แถวที่ไม่ผ่านมีพื้นสีอ่อนและจะไม่ถูกเขียนลงฐานข้อมูล')}
    <section class="stats" data-total="${rows.length}" data-create="${creates}" data-update="${updates}" data-reject="${rejects}">
      <article class="stat"><span>ทั้งหมด</span><b>${rows.length}</b></article>
      <article class="stat"><span>จะเพิ่ม</span><b>${creates}</b></article>
      <article class="stat"><span>จะอัปเดต</span><b>${updates}</b></article>
      <article class="stat"><span>ไม่ผ่าน</span><b>${rejects}</b></article>
    </section>
    <section class="panel">
      <div class="table-wrap"><table class="preview">
        <thead><tr><th>แถว</th><th>SKU</th><th>ชื่อ</th><th>หมวด</th><th>ราคา</th><th>สถานะ</th><th>ผล</th><th>รายละเอียด</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      ${commit}
    </section>`;
  return layout({ title: 'ตรวจไฟล์', user, csrf, active: 'import', flash, content });
}

export function teamPage({ user, csrf, flash, users, logs, errors = [], form = { name: '', email: '' } }) {
  const userRows = users.map((item) => `<tr>
    <td>${esc(item.name)}</td>
    <td>${esc(item.email)}</td>
    <td>${esc(item.role)}</td>
    <td>${esc(formatWhen(item.created_at))}</td>
  </tr>`).join('');
  const mail = logs.length
    ? logs.map((log) => {
      const href = safeHref(log.link);
      return `<article class="mail">
        <header><strong>${esc(log.subject)}</strong><span>${esc(formatWhen(log.created_at))}</span></header>
        <p>ถึง ${esc(log.to_email)}</p>
        <pre>${esc(log.body)}</pre>
        ${href ? `<p><a href="${esc(href)}">เปิดลิงก์คำเชิญ</a></p>` : ''}
      </article>`;
    }).join('')
    : '<p class="muted">ยังไม่มีอีเมล</p>';
  const content = `
    ${pageHead('ทีมงาน', 'คำเชิญ Admin', 'มีสองบทบาท Super Admin กับ Admin มีเพียง Super Admin ที่เพิ่มผู้ใช้ได้ ระบบบันทึกอีเมลไว้ที่หน้านี้แทนการส่งจริง')}
    <section class="panel">
      ${errorList(errors)}
      <form method="post" action="/admin/team/invite" class="form-grid">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <label class="field"><span>ชื่อ</span><input name="name" required maxlength="80" value="${esc(form.name)}"></label>
        <label class="field"><span>อีเมล</span><input name="email" type="email" required value="${esc(form.email)}"></label>
        <div class="actions"><button class="primary" type="submit">ส่งคำเชิญ</button></div>
      </form>
    </section>
    <section class="panel">
      <h2>บัญชีในระบบ</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>สร้างเมื่อ</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <h2>บันทึกอีเมล</h2>
      ${mail}
    </section>`;
  return layout({ title: 'ทีมงาน', user, csrf, active: 'team', flash, content });
}

export function scansPage({ user, csrf, flash, top, recent }) {
  const content = `
    ${pageHead('การสแกน', 'บันทึกการเปิดหน้าสินค้า', 'ทุกครั้งที่ลูกค้าเปิดหน้าสินค้าจาก QR ระบบเก็บเวลา IP และ user agent')}
    <section class="panel">
      <h2>สินค้าที่ถูกดูมากที่สุด</h2>
      ${rankList(top)}
    </section>
    <section class="panel">
      <h2>รายการล่าสุด</h2>
      ${scanTable(recent)}
    </section>`;
  return layout({ title: 'การสแกน', user, csrf, active: 'scans', flash, content });
}

export function invitePage({ csrf, invite, errors }) {
  return htmlPage({
    title: 'ยืนยันคำเชิญ · Luma Skin',
    bodyClass: 'auth',
    content: `<main class="auth-shell">
      <section class="auth-copy">
        <p class="brand-line">${wordmark()}</p>
        <h1>ยืนยันตัวตน แล้วตั้งรหัสผ่านเอง</h1>
        <p>คำเชิญนี้ใช้ได้ครั้งเดียว</p>
      </section>
      <section class="auth-card">
        <p class="eyebrow">คำเชิญ Admin</p>
        <h2>ตั้งรหัสผ่าน</h2>
        <p class="lede">${esc(invite.email)}</p>
        ${errorList(errors)}
        <form method="post">
          <input type="hidden" name="csrf" value="${esc(csrf)}">
          <label class="field"><span>ชื่อ</span><input name="name" required maxlength="80" value="${esc(invite.name)}"></label>
          <label class="field"><span>รหัสผ่านใหม่</span><input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
          <label class="field"><span>ยืนยันรหัสผ่าน</span><input name="confirm" type="password" autocomplete="new-password" required minlength="8"></label>
          <p class="hint">อย่างน้อย 8 ตัวอักษร</p>
          <button class="primary" type="submit">ยืนยันและตั้งรหัสผ่าน</button>
        </form>
      </section>
    </main>`,
  });
}

export function simplePage({ title, message }) {
  return htmlPage({
    title: `${title} · Luma Skin`,
    bodyClass: 'public',
    content: `<main class="sheet">
      <p class="brand-line">${wordmark()}</p>
      <h1>${esc(title)}</h1>
      <p>${esc(message)}</p>
    </main>`,
  });
}

export function notFoundPage({ user, csrf }) {
  const inner = `${pageHead('Luma Skin', 'ไม่พบหน้านี้', 'ลิงก์อาจไม่ถูกต้อง')}<p class="actions"><a class="button" href="${user ? '/admin' : '/'}">กลับหน้าแรก</a></p>`;
  if (!user) {
    return htmlPage({
      title: 'ไม่พบหน้า · Luma Skin',
      bodyClass: 'public',
      content: `<main class="sheet">${inner}</main>`,
    });
  }
  return layout({ title: 'ไม่พบหน้า', user, csrf, active: '', content: inner });
}

export function forbiddenPage({ user, csrf }) {
  const content = `${pageHead('สิทธิ์ไม่พอ', 'เฉพาะ Super Admin', 'Admin จัดการสินค้า QR และการนำเข้าได้ แต่เพิ่มผู้ใช้ได้เฉพาะ Super Admin')}<p class="actions"><a class="button" href="/admin">กลับภาพรวม</a></p>`;
  return layout({ title: 'สิทธิ์ไม่พอ', user, csrf, active: '', content });
}

function publicHero(product) {
  if (!product.image_path) {
    return '<div class="hero hero-empty"><span class="latin">Luma</span><small>ยังไม่มีรูปสินค้า</small></div>';
  }
  const src = `/media/${encodeURIComponent(product.image_path)}?v=${encodeURIComponent(product.updated_at)}`;
  return `<img class="hero" src="${src}" alt="${esc(product.name)}">`;
}

function copyBlock(title, text) {
  if (!text) return '';
  const paragraphs = esc(text).split(/\n{2,}/).map((part) => `<p>${part.replaceAll('\n', '<br>')}</p>`).join('');
  return `<section class="copy"><h2>${esc(title)}</h2>${paragraphs}</section>`;
}

export function publicProductPage(product) {
  const meta = [product.size, product.sku].filter(Boolean).join(' · ');
  return htmlPage({
    title: `${product.name} · Luma Skin`,
    bodyClass: 'public',
    content: `<main class="sheet">
      <p class="brand-line">${wordmark()}</p>
      ${publicHero(product)}
      ${product.category ? `<p class="eyebrow">${esc(product.category)}</p>` : ''}
      <h1>${esc(product.name)}</h1>
      <p class="price">${esc(formatPrice(product.price))}</p>
      <p class="meta">${esc(meta)}</p>
      ${copyBlock('เกี่ยวกับสินค้า', product.description)}
      ${copyBlock('วิธีใช้', product.how_to_use)}
      <p class="updated">อัปเดตล่าสุด ${esc(formatWhen(product.updated_at))}</p>
      <p class="foot">Luma Skin · สแกน QR นี้เมื่อไร ก็เห็นข้อมูลล่าสุดจากแบรนด์</p>
    </main>`,
  });
}

export function unavailablePage() {
  return htmlPage({
    title: 'ไม่พบข้อมูลสินค้า · Luma Skin',
    bodyClass: 'public',
    content: `<main class="sheet">
      <p class="brand-line">${wordmark()}</p>
      <h1>ไม่พบข้อมูลสินค้านี้</h1>
      <p>QR นี้อาจไม่ถูกต้อง หรือสินค้าไม่ได้แสดงต่อสาธารณะ</p>
    </main>`,
  });
}
