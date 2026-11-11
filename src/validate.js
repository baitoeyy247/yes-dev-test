export const CATEGORIES = ['Cleanser', 'Toner', 'Serum', 'Moisturizer', 'Sunscreen', 'Mask'];

export const COLUMN_HELP = [
  ['sku', 'จำเป็น', 'ข้อความ', 'รหัสสินค้า ไม่จำกัดรูปแบบ เช่น LS-0000'],
  ['name', 'จำเป็น', 'ข้อความ', 'ชื่อสินค้า'],
  ['category', 'ไม่จำเป็น', 'ข้อความ', 'Cleanser, Toner, Serum, Moisturizer, Sunscreen หรือ Mask'],
  ['price', 'จำเป็น', 'ตัวเลข', 'ราคาเป็นบาท มากกว่า 0'],
  ['size', 'ไม่จำเป็น', 'ข้อความ', 'เช่น 30 ml, 50 g'],
  ['description', 'ไม่จำเป็น', 'ข้อความ', 'รายละเอียดสินค้า'],
  ['how_to_use', 'ไม่จำเป็น', 'ข้อความ', 'วิธีใช้'],
  ['status', 'ไม่จำเป็น', 'ข้อความ', 'active หรือ inactive ถ้าว่างจะบันทึกเป็น active และสินค้า inactive ไม่แสดงบนหน้าสาธารณะ'],
];

const LIMITS = {
  sku: 80,
  name: 200,
  size: 80,
  description: 5000,
  howToUse: 5000,
};

export function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

export function normalizeSku(value) {
  const sku = clean(value);
  if (!sku) return { error: 'กรอก SKU' };
  if (sku.length > LIMITS.sku) return { error: `SKU ยาวเกิน ${LIMITS.sku} ตัวอักษร` };
  return { value: sku };
}

export function normalizeName(value) {
  const name = clean(value);
  if (!name) return { error: 'กรอกชื่อสินค้า' };
  if (name.length > LIMITS.name) return { error: `ชื่อสินค้ายาวเกิน ${LIMITS.name} ตัวอักษร` };
  return { value: name };
}

export function normalizePrice(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { error: 'ราคาต้องเป็นตัวเลข' };
    return finishPrice(value);
  }
  const text = clean(value).replace(/฿/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (!text) return { error: 'กรอกราคา' };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { error: 'ราคาต้องเป็นตัวเลข' };
  return finishPrice(Number(text));
}

function finishPrice(value) {
  const rounded = Math.round(value * 100) / 100;
  if (!(rounded > 0)) return { error: 'ราคาต้องมากกว่า 0' };
  return { value: rounded };
}

export function normalizeCategory(value) {
  const text = clean(value);
  if (!text) return { value: null };
  const found = CATEGORIES.find((item) => item.toLowerCase() === text.toLowerCase());
  if (!found) {
    return { error: 'หมวดหมู่ต้องเป็น Cleanser, Toner, Serum, Moisturizer, Sunscreen หรือ Mask' };
  }
  return { value: found };
}

export function normalizeStatus(value) {
  const text = clean(value).toLowerCase();
  if (!text) return { value: 'active' };
  if (text === 'active' || text === 'inactive') return { value: text };
  return { error: 'สถานะต้องเป็น active หรือ inactive' };
}

export function normalizeOptional(value, max, label) {
  const text = clean(value);
  if (!text) return { value: null };
  if (text.length > max) return { error: `${label}ยาวเกิน ${max} ตัวอักษร` };
  return { value: text };
}

export function validateRow(raw) {
  const sku = normalizeSku(raw.sku);
  const name = normalizeName(raw.name);
  const price = normalizePrice(raw.price);
  const category = normalizeCategory(raw.category);
  const size = normalizeOptional(raw.size, LIMITS.size, 'ขนาด');
  const description = normalizeOptional(raw.description, LIMITS.description, 'รายละเอียด');
  const howToUse = normalizeOptional(raw.how_to_use, LIMITS.howToUse, 'วิธีใช้');
  const status = normalizeStatus(raw.status);
  const errors = [sku, name, price, category, size, description, howToUse, status]
    .filter((part) => part.error)
    .map((part) => part.error);
  if (errors.length) return { errors, value: null };
  return {
    errors,
    value: {
      sku: sku.value,
      name: name.value,
      category: category.value,
      price: price.value,
      size: size.value,
      description: description.value,
      how_to_use: howToUse.value,
      status: status.value,
    },
  };
}

function rawText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return clean(value);
}

export function validateRows(rows) {
  const annotated = rows.map((row) => {
    const result = validateRow(row.values);
    return {
      rowNumber: row.rowNumber,
      raw: {
        sku: rawText(row.values.sku),
        name: rawText(row.values.name),
        category: rawText(row.values.category),
        price: rawText(row.values.price),
        size: rawText(row.values.size),
        description: rawText(row.values.description),
        how_to_use: rawText(row.values.how_to_use),
        status: rawText(row.values.status),
      },
      ...result,
    };
  });

  const groups = new Map();
  for (const row of annotated) {
    const sku = clean(row.raw.sku);
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.errors.push('SKU ซ้ำในไฟล์นี้');
      row.value = null;
    }
  }
  return annotated;
}

export function productFromForm(body) {
  const display = {
    sku: clean(body.sku),
    name: clean(body.name),
    category: clean(body.category),
    price: clean(body.price),
    size: clean(body.size),
    description: clean(body.description),
    how_to_use: clean(body.how_to_use),
    status: clean(body.status) || 'active',
  };
  const result = validateRow(display);
  return { errors: result.errors, value: result.value, display };
}
