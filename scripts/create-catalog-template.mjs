/**
 * Create / refresh a per-tenant Excel catalog template (one workbook, 4 sheets).
 *
 * Sheets (fill in this order):
 *   1. item_types
 *   2. item_strengths
 *   3. vendors
 *   4. items   (item_type / strength must match names from sheets 1–2)
 *
 * items columns follow the New Item form order:
 *   service_station (Served from: bar | kitchen) → identity → type/strength →
 *   volume_ml + low_stock_threshold → purchase_price + selling_price → opening_stock
 *
 * Usage:
 *   node scripts/create-catalog-template.mjs nisarg_hotel
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT, 'data', 'catalog');

const SHEETS = {
  item_types: {
    headers: ['name', 'sort_order'],
    rows: [
      { name: 'NA', sort_order: 0 },
      { name: 'Whisky', sort_order: 1 },
      { name: 'Beer', sort_order: 2 },
      { name: 'Snacks', sort_order: 3 },
    ],
  },
  item_strengths: {
    headers: ['name', 'sort_order'],
    rows: [
      { name: 'NA', sort_order: 0 },
      { name: 'Mild', sort_order: 1 },
      { name: 'Strong', sort_order: 2 },
    ],
  },
  vendors: {
    headers: ['name', 'phone'],
    rows: [
      { name: 'Local Distributor', phone: '9876543210' },
      { name: 'Kitchen Supplier', phone: '' },
    ],
  },
  items: {
    headers: [
      'service_station',
      'item_code',
      'name_en',
      'name_mr',
      'brand',
      'item_type',
      'strength',
      'volume_ml',
      'low_stock_threshold',
      'purchase_price',
      'selling_price',
      'opening_stock',
    ],
    rows: [
      {
        service_station: 'bar',
        item_code: 'BL180',
        name_en: 'Blue Label',
        name_mr: 'Blue Label',
        brand: 'Johnnie Walker',
        item_type: 'Whisky',
        strength: 'Strong',
        volume_ml: 180,
        low_stock_threshold: 2,
        purchase_price: 1200,
        selling_price: 1500,
        opening_stock: 10,
      },
      {
        service_station: 'kitchen',
        item_code: 'SM001',
        name_en: 'Samosa',
        name_mr: 'Samosa',
        brand: 'Kitchen',
        item_type: 'Snacks',
        strength: 'NA',
        volume_ml: 1,
        low_stock_threshold: 5,
        purchase_price: 10,
        selling_price: 40,
        opening_stock: 50,
      },
    ],
  },
};

function addSheet(workbook, name, headers, rows) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.sheet_add_aoa(sheet, [headers], { origin: 'A1' });
  sheet['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function main() {
  const slug = process.argv[2]?.trim();
  if (!slug) {
    console.error('Usage: node scripts/create-catalog-template.mjs <tenant_slug>');
    process.exit(1);
  }

  const tenantsPath = path.join(CATALOG_DIR, 'tenants.json');
  const tenants = JSON.parse(fs.readFileSync(tenantsPath, 'utf8'));
  const tenant = tenants[slug];
  if (!tenant) {
    throw new Error(`Unknown tenant slug "${slug}" in tenants.json`);
  }

  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  const outPath = path.join(CATALOG_DIR, tenant.workbook);

  const workbook = XLSX.utils.book_new();
  for (const [name, def] of Object.entries(SHEETS)) {
    addSheet(workbook, name, def.headers, def.rows);
  }
  XLSX.writeFile(workbook, outPath);

  console.log(`Wrote template: ${outPath}`);
  console.log(`Tenant: ${tenant.businessName} (${tenant.tenantId})`);
  console.log('Sheets: item_types → item_strengths → vendors → items');
  console.log('Replace sample rows, then run:');
  console.log(`  node scripts/import-catalog.mjs ${slug}`);
}

main();
