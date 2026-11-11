import { getProductBySku, insertProduct, updateProduct } from './db.js';

export function commitRows(db, rows) {
  db.exec('BEGIN IMMEDIATE');
  try {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (row.action !== 'create' && row.action !== 'update') continue;
      const existing = getProductBySku(db, row.value.sku);
      if (row.action === 'create') {
        if (existing) {
          const error = new Error('conflict');
          error.code = 'IMPORT_CONFLICT';
          throw error;
        }
        insertProduct(db, row.value);
        created += 1;
      } else if (!existing) {
        const error = new Error('conflict');
        error.code = 'IMPORT_CONFLICT';
        throw error;
      } else {
        updateProduct(db, existing.id, row.value);
        updated += 1;
      }
    }
    db.exec('COMMIT');
    return { created, updated };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction may already be closed.
    }
    throw error;
  }
}
