import ExcelJS from 'exceljs';

const CANONICAL = {
  sku: 'sku',
  name: 'name',
  category: 'category',
  price: 'price',
  size: 'size',
  description: 'description',
  how_to_use: 'how_to_use',
  howto_use: 'how_to_use',
  howtouse: 'how_to_use',
  status: 'status',
};

export function asText(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return '';
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return asText(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (typeof value.text === 'string') return value.text;
  }
  return String(value);
}

function headerKey(value) {
  return asText(value).replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { error: 'อ่านไฟล์ Excel ไม่ได้ โปรดใช้ไฟล์ .xlsx' };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: 'ไม่พบชีตในไฟล์ Excel' };

  const columns = new Map();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = CANONICAL[headerKey(cell.value)];
    if (key && !columns.has(key)) columns.set(key, col);
  });

  const missing = ['sku', 'name', 'price'].filter((key) => !columns.has(key));
  if (missing.length) return { error: `ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(', ')}` };

  const fields = ['sku', 'name', 'category', 'price', 'size', 'description', 'how_to_use', 'status'];
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = {};
    for (const field of fields) {
      const col = columns.get(field);
      if (!col) {
        values[field] = '';
        continue;
      }
      const cellValue = row.getCell(col).value;
      values[field] = field === 'price' && typeof cellValue === 'number' ? cellValue : asText(cellValue);
    }
    const blank = fields.every((field) => String(values[field] ?? '').trim() === '');
    if (!blank) rows.push({ rowNumber, values });
  }
  if (!rows.length) return { error: 'ไม่พบแถวข้อมูล' };
  return { rows };
}
