import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function item(sku, name, category, price, size, description, how, status = 'active') {
  return { sku, name, category, price, size, description, how, status };
}

const catalog = [
  item('LS-1001', 'Luma Cloud Cleanser', 'Cleanser', 890, '150 ml',
    'เนื้อเจลบางเบา ช่วยชำระฝุ่นและครีมกันแดดโดยไม่ทำให้ผิวแห้งตึง',
    'ใช้เช้าและก่อนนอน นวดบนหน้าที่เปียกประมาณ 30 วินาที แล้วล้างออก'),
  item('LS-1002', 'Luma Rice Enzyme Cleanser', 'Cleanser', 790, '120 ml',
    'คลีนเซอร์เอนไซม์จากข้าว ช่วยผลัดเซลล์ผิวอย่างอ่อนโยน',
    'ใช้สัปดาห์ละ 3–4 ครั้ง แทนคลีนเซอร์ปกติ'),
  item('LS-1003', 'Luma Calm Foam Cleanser', 'Cleanser', 690, '150 ml',
    'โฟมล้างหน้าเนื้อบางเบา สำหรับผิวที่ระคายเคืองง่าย',
    'ใช้เช้าและเย็น แล้วล้างออกด้วยน้ำสะอาด'),
  item('LS-1004', 'Luma Milk Melt Cleanser', 'Cleanser', 750, '100 ml',
    'คลีนเซอร์เนื้อน้ำนม ช่วยละลายครีมกันแดดและเมคอัพ',
    'ใช้เป็นขั้นตอนแรกของการล้างหน้า แล้วตามด้วยโฟม'),
  item('LS-1101', 'Luma Dew Toner', 'Toner', 850, '150 ml',
    'โทนเนอร์ปรับสมดุลผิว เติมความชุ่มชื้นทันทีหลังล้างหน้า',
    'เทใส่ฝ่ามือแล้วแตะทั่วใบหน้า เช้าและเย็น'),
  item('LS-1102', 'Luma Rice Water Toner', 'Toner', 920, '200 ml',
    'โทนเนอร์น้ำข้าว ช่วยให้ผิวดูกระจ่างและนุ่มขึ้น',
    'ใช้หลังล้างหน้า เช้าและเย็น'),
  item('LS-1103', 'Luma Birch Toner', 'Toner', 780, '150 ml',
    'โทนเนอร์สารสกัดเบิร์ช ช่วยปลอบผิวที่ระคายเคือง',
    'ใช้หลังล้างหน้า หลีกเลี่ยงรอบดวงตา'),
  item('LS-1104', 'Luma PHA Soft Toner', 'Toner', 820, '150 ml',
    'โทนเนอร์ PHA ความเข้มข้นต่ำ ผลัดผิวอย่างค่อยเป็นค่อยไป',
    'ใช้ตอนเย็น แล้วตามด้วยมอยส์เจอไรเซอร์'),
  item('LS-1201', 'Luma Glow C Serum', 'Serum', 1590, '30 ml',
    'เซรั่มวิตามินซี ช่วยให้ผิวแลดูกระจ่างใส',
    'ใช้ตอนเช้า 2–3 หยด ก่อนครีมกันแดด'),
  item('LS-1202', 'Luma Niacinamide Serum', 'Serum', 1290, '30 ml',
    'เซรั่มไนอะซินาไมด์ ช่วยให้ผิวดูเรียบเนียน',
    'ใช้เช้าและเย็นหลังโทนเนอร์'),
  item('LS-1203', 'Luma Cica Serum', 'Serum', 1390, '30 ml',
    'เซรั่มใบบัวบก ช่วยปลอบผิวที่ระคายเคืองและฟื้นความรู้สึกสบายผิว',
    'ใช้ได้ทุกวัน เช้าและเย็น'),
  item('LS-1204', 'Luma Peptide Serum', 'Serum', 1890, '30 ml',
    'เซรั่มเปปไทด์ ช่วยให้ผิวดูแน่นกระชับ',
    'ใช้ตอนเย็นหลังโทนเนอร์'),
  item('LS-1205', 'Luma Hyaluron Serum', ' serum ', 1450, '30 ml',
    'เซรั่มไฮยาลูรอน เติมน้ำให้ผิวอิ่มฟู',
    'ใช้บนผิวที่ยังหมาด แล้วตามด้วยครีม'),
  item('LS-1301', 'Luma Cloud Cream', 'Moisturizer', 1490, '50 ml',
    'ครีมเนื้อคล้ายเมฆ ล็อกความชุ่มชื้นตลอดวัน',
    'ใช้เป็นขั้นตอนสุดท้ายของสกินแคร์ เช้าและเย็น'),
  item('LS-1302', 'Luma Barrier Cream', 'Moisturizer', 1350, '50 g',
    'ครีมเสริมเกราะผิว สำหรับผิวแห้งและระคายเคือง',
    'ทาบาง ๆ หลังเซรั่ม'),
  item('LS-1303', 'Luma Rice Gel', 'Moisturizer', 1190, '50 ml',
    'เจลครีมจากข้าว บางเบา ไม่เหนียว เหมาะกับอากาศร้อน',
    'ใช้ตอนเช้าก่อนกันแดด'),
  item('LS-1304', 'Luma Night Cream', 'Moisturizer', 1690, '50 ml',
    'ครีมบำรุงกลางคืน ช่วยให้ผิวตื่นมาดูชุ่มชื้น',
    'ใช้ตอนเย็นเป็นขั้นตอนสุดท้าย'),
  item('LS-1401', 'Luma Daily Veil SPF50', 'Sunscreen', 890, '40 ml',
    'ครีมกันแดด SPF50 PA++++ เนื้อบางเกลี่ยง่าย',
    'ทาเป็นขั้นตอนสุดท้ายตอนเช้า และเติมระหว่างวัน'),
  item('LS-1402', 'Luma Mineral SPF50', 'Sunscreen', 990, '40 ml',
    'กันแดดมิเนอรัลสำหรับผิวบอบบาง เกลี่ยแล้วไม่ขาววอก',
    'ทาปริมาณ 2 ข้อนิ้วทั่วใบหน้า'),
  item('LS-1403', 'Luma Tone Up SPF50', 'Sunscreen', 1090, '30 ml',
    'กันแดดปรับโทนผิวให้ดูสว่างอย่างเป็นธรรมชาติ',
    'ใช้แทนเมคอัพบางวันที่ต้องการลุคบางเบา', ' ACTIVE '),
  item('LS-1501', 'Luma Clay Mask', 'Mask', 690, '50 ml',
    'มาสก์ดิน ช่วยดูดความมันส่วนเกิน',
    'ใช้สัปดาห์ละ 1–2 ครั้ง ทา 10 นาทีแล้วล้างออก'),
  item('LS-1502', 'Luma Honey Mask', 'Mask', 890, '50 ml',
    'มาสก์น้ำผึ้ง ปลอบผิวและเติมความนุ่ม',
    'ทาบาง ๆ ตอนเย็น ล้างออกในเช้าวันถัดไป'),
  item('LS-1503', 'Luma Jelly Mask', 'Mask', 590, '80 ml',
    'มาสก์เจลลี่ เติมน้ำให้ผิวใน 15 นาที',
    'แช่เย็นก่อนใช้ได้ ทาแล้วล้างออก', ''),
  item('LS-1504', 'Luma Charcoal Mask', 'Mask', 650, '50 ml',
    'มาสก์ชาร์โคล สูตรที่ยังไม่เปิดขาย',
    'ยังไม่แนะนำให้ใช้', 'inactive'),
];

const invalidFirst = [
  item('', 'คลีนเซอร์ไม่มีรหัส', 'Cleanser', 500, '50 ml', '', '', 'active'),
  item('LS-9001', '', 'Cleanser', 500, '50 ml', '', '', 'active'),
  item('LS-9002', 'Zero Price Toner', 'Toner', 0, '50 ml', '', '', 'active'),
  item('LS-9003', 'Negative Serum', 'Serum', -50, '30 ml', '', '', 'active'),
  item('LS-9004', 'Text Price Serum', 'Serum', 'เก้าสิบ', '30 ml', '', '', 'active'),
  item('LS-9005', 'Wrong Category Lotion', 'Lotion', 300, '50 ml', '', '', 'active'),
  item('LS-9006', 'Archived Mask', 'Mask', 300, '50 ml', '', '', 'archived'),
  item('LS-9007', 'Duplicate One', 'Cleanser', 450, '50 ml', '', '', 'active'),
  item('LS-9007', 'Duplicate Two', 'Cleanser', 460, '50 ml', '', '', 'active'),
];

function bySku(sku) {
  const found = catalog.find((row) => row.sku === sku);
  if (!found) throw new Error(`missing ${sku}`);
  return { ...found };
}

const updateRows = [
  { ...bySku('LS-1001'), name: 'Luma Cloud Cleanser สูตรใหม่', price: 940,
    description: 'สูตรใหม่ เนื้อเจลเนียนขึ้น ล้างออกง่าย และไม่ทิ้งความแห้งตึง',
    how: 'ใช้เช้าและก่อนนอน ล้างออกให้สะอาด' },
  { ...bySku('LS-1201'), price: 1490,
    description: 'เซรั่มวิตามินซีสูตรปรับใหม่ ใช้ตอนเช้าก่อนครีมกันแดด' },
  { ...bySku('LS-1204'), status: 'inactive' },
  { ...bySku('LS-1101'), size: '200 ml' },
  { ...bySku('LS-1301'), price: 1390 },
  { ...bySku('LS-1002'), sku: 'ls-1002', price: 820 },
  { ...bySku('LS-1401'), description: 'ครีมกันแดด SPF50 สูตรใหม่ เนื้อบางและทนเหงื่อได้ดีขึ้น', status: '' },
  item('LS-1601', 'Luma Lip Sleep Mask', 'Mask', 490, '12 g',
    'มาสก์บำรุงริมฝีปากข้ามคืน', 'ทาบาง ๆ ก่อนนอน'),
  item('LS-1208', 'Luma Azelaic Serum', 'Serum', 1550, '30 ml',
    'เซรั่มอะเซลาอิก ช่วยให้ผิวดูสม่ำเสมอ', 'ใช้ตอนเย็น หลังโทนเนอร์', ''),
  item('LS-1006', 'Luma Powder Cleanser', 'Cleanser', 690, '40 g',
    'คลีนเซอร์ผง ผสมน้ำแล้วล้างหน้า', 'ผสมน้ำเล็กน้อยจนเป็นฟอง แล้วล้างออก'),
  item('LS-1306', 'Luma Neck Cream', 'Moisturizer', 1290, '40 ml',
    'ครีมบำรุงลำคอ เนื้อนุ่มซึมไว', 'ทาจากคางลงลำคอ เช้าและเย็น'),
  item('LS-9090', 'Dup Update A', 'Toner', 500, '50 ml', '', '', 'active'),
  item('LS-9090', 'Dup Update B', 'Toner', 510, '50 ml', '', '', 'active'),
  item('LS-9091', '', 'Toner', 500, '50 ml', '', '', 'active'),
  item('LS-9092', 'Essence Not Allowed', 'Essence', 500, '30 ml', '', '', 'active'),
  item('LS-9093', 'Missing Price Mask', 'Mask', null, '50 ml', '', '', 'active'),
  item('LS-1203', 'Luma Cica Serum', 'Serum', -10, '30 ml',
    'ข้อความนี้ไม่ควรถูกบันทึก เพราะราคาติดลบ', 'ไม่ควรบันทึก', 'active'),
  item('LS-9094', 'Draft Status Toner', 'Toner', 420, '50 ml', '', '', 'draft'),
];

async function writeFile(filename, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('products');
  const header = sheet.addRow(['sku', 'name', 'category', 'price', 'size', 'description', 'how_to_use', 'status']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF241C18' } };
  });
  for (const row of rows) {
    sheet.addRow([row.sku, row.name, row.category, row.price, row.size, row.description, row.how, row.status]);
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'H1' };
  [14, 34, 18, 12, 12, 62, 52, 14].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  const target = path.join(dir, filename);
  await workbook.xlsx.writeFile(target);
  console.log(`${filename}: ${rows.length} data rows`);
}

await writeFile('luma_products.xlsx', [...catalog, ...invalidFirst]);
await writeFile('luma_products_update.xlsx', updateRows);
