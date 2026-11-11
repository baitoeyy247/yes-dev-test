const DIFF_FIELDS = [
  ['sku', 'SKU'],
  ['name', 'ชื่อ'],
  ['category', 'หมวดหมู่'],
  ['price', 'ราคา'],
  ['size', 'ขนาด'],
  ['description', 'รายละเอียด'],
  ['how_to_use', 'วิธีใช้'],
  ['status', 'สถานะ'],
];

function same(field, left, right) {
  if (field === 'price') return Number(left) === Number(right);
  const a = left == null || left === '' ? null : String(left);
  const b = right == null || right === '' ? null : String(right);
  return a === b;
}

export function diffProduct(existing, next) {
  const changes = [];
  for (const [field, label] of DIFF_FIELDS) {
    if (same(field, existing[field], next[field])) continue;
    changes.push({
      field,
      label,
      from: existing[field] == null ? '' : String(existing[field]),
      to: next[field] == null ? '' : String(next[field]),
    });
  }
  return changes;
}

export function annotateActions(rows, findBySku) {
  return rows.map((row) => {
    if (row.errors.length || !row.value) {
      return { ...row, action: 'reject', changes: [], productId: null, publicCode: null };
    }
    const existing = findBySku(row.value.sku);
    if (!existing) {
      return { ...row, action: 'create', changes: [], productId: null, publicCode: null };
    }
    return {
      ...row,
      action: 'update',
      changes: diffProduct(existing, row.value),
      productId: existing.id,
      publicCode: existing.public_code,
    };
  });
}
