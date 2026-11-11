import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { parseXlsx } from '../src/excel.js';
import { detectImage } from '../src/images.js';
import { qrColors, qrSize } from '../src/qr.js';
import { validateRow, validateRows } from '../src/validate.js';

const sampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sample-data');

describe('validation', () => {
  test('accepts a normalized catalog row', () => {
    const result = validateRow({
      sku: ' LS-1 ',
      name: 'A',
      category: ' serum ',
      price: '1,200',
      size: '',
      description: '',
      how_to_use: '',
      status: ' ACTIVE ',
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.value, {
      sku: 'LS-1',
      name: 'A',
      category: 'Serum',
      price: 1200,
      size: null,
      description: null,
      how_to_use: null,
      status: 'active',
    });
  });

  test('rejects the documented bad values', () => {
    assert.equal(validateRow({ sku: '', name: 'A', price: 10, category: '', size: '', description: '', how_to_use: '', status: '' }).errors[0], 'กรอก SKU');
    assert.ok(validateRow({ sku: 'LS-1', name: '', price: 10, category: '', size: '', description: '', how_to_use: '', status: '' }).errors.includes('กรอกชื่อสินค้า'));
    assert.ok(validateRow({ sku: 'LS-1', name: 'A', price: '', category: '', size: '', description: '', how_to_use: '', status: '' }).errors.includes('กรอกราคา'));
    assert.ok(validateRow({ sku: 'LS-1', name: 'A', price: 0, category: '', size: '', description: '', how_to_use: '', status: '' }).errors.includes('ราคาต้องมากกว่า 0'));
    assert.ok(validateRow({ sku: 'LS-1', name: 'A', price: -5, category: '', size: '', description: '', how_to_use: '', status: '' }).errors.includes('ราคาต้องมากกว่า 0'));
    assert.ok(validateRow({ sku: 'LS-1', name: 'A', price: 'เก้าสิบ', category: '', size: '', description: '', how_to_use: '', status: '' }).errors.includes('ราคาต้องเป็นตัวเลข'));
    assert.ok(validateRow({ sku: 'LS-1', name: 'A', price: 10, category: 'Lotion', size: '', description: '', how_to_use: '', status: '' }).errors[0].includes('หมวดหมู่ต้องเป็น'));
    assert.ok(validateRow({ sku: 'LS-1', name: 'A', price: 10, category: '', size: '', description: '', how_to_use: '', status: 'draft' }).errors.includes('สถานะต้องเป็น active หรือ inactive'));
  });

  test('blank status becomes active and duplicate SKUs are all rejected', () => {
    const rows = validateRows([
      { rowNumber: 2, values: { sku: 'LS-1', name: 'A', price: 10, category: '', size: '', description: '', how_to_use: '', status: '' } },
      { rowNumber: 3, values: { sku: 'ls-1', name: 'B', price: 12, category: '', size: '', description: '', how_to_use: '', status: 'active' } },
    ]);
    assert.equal(rows[0].value, null);
    assert.equal(rows[1].value, null);
    assert.ok(rows[0].errors.includes('SKU ซ้ำในไฟล์นี้'));
    assert.equal(rows[0].errors.includes('กรอก SKU'), false);
  });
});

describe('excel samples', () => {
  test('first file has 24 valid rows and 9 invalid rows', async () => {
    const parsed = await parseXlsx(await readFile(path.join(sampleDir, 'luma_products.xlsx')));
    assert.equal(parsed.error, undefined);
    const rows = validateRows(parsed.rows);
    assert.equal(rows.length, 33);
    assert.equal(rows.filter((row) => row.errors.length === 0).length, 24);
    const hyaluron = rows.find((row) => row.raw.sku === 'LS-1205');
    assert.equal(hyaluron.value.category, 'Serum');
    assert.equal(rows.find((row) => row.raw.sku === 'LS-1403').value.status, 'active');
    assert.equal(rows.find((row) => row.raw.sku === 'LS-1503').value.status, 'active');
    assert.equal(rows.find((row) => row.raw.sku === 'LS-1504').value.status, 'inactive');
  });

  test('update file has 11 valid rows and 7 invalid rows', async () => {
    const parsed = await parseXlsx(await readFile(path.join(sampleDir, 'luma_products_update.xlsx')));
    const rows = validateRows(parsed.rows);
    assert.equal(rows.length, 18);
    assert.equal(rows.filter((row) => row.errors.length === 0).length, 11);
  });

  test('missing required columns are reported', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('products');
    sheet.addRow(['name', 'price']);
    sheet.addRow(['Only name', 10]);
    const parsed = await parseXlsx(Buffer.from(await workbook.xlsx.writeBuffer()));
    assert.match(parsed.error, /sku/);
  });
});

describe('files and qr colors', () => {
  test('detects png and rejects gif', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    assert.equal(detectImage(png), 'png');
    assert.equal(detectImage(gif), null);
  });

  test('keeps QR modules readable against the chosen background', () => {
    assert.equal(qrColors('#000000').dark, '#ffffff');
    assert.equal(qrColors('#ffffff').dark, '#241c18');
    assert.equal(qrColors('nope').light, '#fffdfb');
    assert.equal(qrSize('10'), 200);
    assert.equal(qrSize('480'), 480);
    assert.equal(qrSize('5000'), 1200);
  });
});
