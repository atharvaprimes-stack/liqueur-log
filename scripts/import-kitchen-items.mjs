/**
 * Import kitchen menu items from a friendly Excel workbook into Supabase.
 *
 * Expected sheet: "Menu Items" (or the first sheet) with columns:
 *   English Name, Marathi Equivalent Name, Brand, Type, Strength,
 *   Purchase, Selling, Opening, Low Stock
 * Optional: id (UUID), serial_no
 *
 * Cells with "NA" mean the field does not apply (stored as safe defaults;
 * kitchen items are not inventory-tracked).
 *
 * Usage:
 *   node scripts/import-kitchen-items.mjs nisarg_hotel "C:\path\Kitchen Items.xlsx"
 *
 * Requires the same .env keys as import-catalog.mjs.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT, 'data', 'catalog');
const CHUNK_SIZE = 40;

const HEADER_MAP = {
  id: 'id',
  'serial no': 'serial_no',
  serial_no: 'serial_no',
  'english name': 'name_en',
  'marathi equivalent name': 'name_mr',
  marathi: 'name_mr',
  brand: 'brand',
  type: 'item_type',
  strength: 'strength',
  purchase: 'purchase_price',
  selling: 'selling_price',
  opening: 'opening_stock',
  'low stock': 'low_stock_threshold',
};

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isNotApplicable(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'NA';
}

function cleanLabel(value, field, maxLen = 80) {
  const clean = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!clean || clean.length > maxLen) {
    throw new Error(`Invalid ${field}: "${value}"`);
  }
  return clean;
}

function parseOptionalId(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new Error(`Invalid id: "${value}" (need a UUID)`);
  }
  return text.toLowerCase();
}

function parseOptionalSerial(value) {
  const text = String(value ?? '').trim();
  if (!text || isNotApplicable(text)) {
    return null;
  }
  const num = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(num) || num < 1 || num > 999999) {
    throw new Error(`Invalid serial_no: "${value}"`);
  }
  return num;
}

function parseMoney(value, field, { allowNa = false } = {}) {
  const text = String(value ?? '')
    .trim()
    .replace(/,/g, '');
  if (allowNa && (text === '' || isNotApplicable(text))) {
    return 0;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Invalid ${field}: "${value}"`);
  }
  return Number(text);
}

function loadTenant(slug) {
  const configPath = path.join(CATALOG_DIR, 'tenants.json');
  const tenants = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tenant = tenants[slug];
  if (!tenant) {
    const known = Object.keys(tenants).join(', ') || '(none)';
    throw new Error(`Unknown tenant slug "${slug}". Known: ${known}`);
  }
  return tenant;
}

function normalizeRow(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = HEADER_MAP[String(key).trim().toLowerCase()];
    if (mapped) {
      out[mapped] = value;
    }
  }
  return out;
}

function readKitchenWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook not found: ${filePath}`);
  }
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames.includes('Menu Items')
    ? 'Menu Items'
    : workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook has no sheets');
  }
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
  });
  if (rawRows.length === 0) {
    throw new Error(`Sheet "${sheetName}" has no rows`);
  }

  const typeOrder = [];
  const typeSeen = new Set();
  const items = [];
  const seenIds = new Set();

  rawRows.forEach((raw, index) => {
    const line = index + 2;
    const row = normalizeRow(raw);
    try {
      const blank = !String(row.name_en ?? '').trim() && !String(row.id ?? '').trim();
      if (blank) {
        return;
      }

      const id = parseOptionalId(row.id);
      if (id) {
        if (seenIds.has(id)) {
          throw new Error(`Duplicate id ${id}`);
        }
        seenIds.add(id);
      }

      const itemType = cleanLabel(row.item_type, 'Type', 40);
      const typeKey = itemType.toLowerCase();
      if (!typeSeen.has(typeKey)) {
        typeSeen.add(typeKey);
        typeOrder.push(itemType);
      }

      const strengthRaw = String(row.strength ?? '').trim();
      const strength = isNotApplicable(strengthRaw) || !strengthRaw ? 'NA' : cleanLabel(strengthRaw, 'Strength', 40);

      items.push({
        id,
        serialNo: parseOptionalSerial(row.serial_no),
        nameEn: cleanLabel(row.name_en, 'English Name'),
        nameMr: cleanLabel(row.name_mr, 'Marathi Equivalent Name'),
        brand: cleanLabel(row.brand, 'Brand'),
        itemType,
        strength,
        serviceStation: 'kitchen',
        volumeMl: 1,
        purchasePrice: parseMoney(row.purchase_price, 'Purchase', { allowNa: true }),
        sellingPrice: parseMoney(row.selling_price, 'Selling'),
        lowStockThreshold: 0,
        openingStock: 0,
      });
    } catch (error) {
      throw new Error(`${sheetName} row ${line}: ${error.message}`);
    }
  });

  if (items.length === 0) {
    throw new Error('No kitchen items found');
  }

  return {
    types: typeOrder.map((name, sortOrder) => ({ name, sortOrder })),
    strengths: [{ name: 'NA', sortOrder: 0 }],
    items,
  };
}

function change(entity, entityId, record) {
  return {
    change_id: crypto.randomUUID(),
    entity,
    entity_id: entityId,
    operation: 'upsert',
    record,
  };
}

function buildChanges(tenantId, parsed) {
  const now = Date.now();
  const changes = [];

  for (const row of parsed.types) {
    const id = crypto.randomUUID();
    changes.push(
      change('item_types', id, {
        id,
        tenant_id: tenantId,
        name: row.name,
        sort_order: row.sortOrder,
        updated_at: now,
      }),
    );
  }

  for (const row of parsed.strengths) {
    const id = crypto.randomUUID();
    changes.push(
      change('item_strengths', id, {
        id,
        tenant_id: tenantId,
        name: row.name,
        sort_order: row.sortOrder,
        updated_at: now,
      }),
    );
  }

  // serial_no 0 → server assigns MAX(serial)+1 so kitchen appends after bar catalog.
  for (const item of parsed.items) {
    const id = item.id ?? crypto.randomUUID();
    changes.push(
      change('items', id, {
        id,
        tenant_id: tenantId,
        serial_no: item.serialNo ?? 0,
        name_en: item.nameEn,
        name_mr: item.nameMr,
        brand: item.brand,
        liquor_type: item.itemType,
        sub_type: item.strength,
        service_station: item.serviceStation,
        volume_ml: item.volumeMl,
        purchase_price: item.purchasePrice,
        selling_price: item.sellingPrice,
        low_stock_threshold: item.lowStockThreshold,
        updated_at: now,
      }),
    );
  }

  return changes;
}

async function pushBatches(supabase, mobile, mpin, changes) {
  let ackedTotal = 0;
  for (let i = 0; i < changes.length; i += CHUNK_SIZE) {
    const chunk = changes.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.rpc('push_sync_batch', {
      p_mobile: mobile,
      p_mpin: mpin,
      p_batch: { changes: chunk },
    });
    if (error) {
      throw new Error(`push_sync_batch failed: ${error.message}`);
    }
    if (!data?.ok || !Array.isArray(data.acked)) {
      throw new Error(`push_sync_batch rejected batch starting at index ${i}`);
    }
    if (data.acked.length !== chunk.length) {
      console.warn(
        `  warn: batch ${i}-${i + chunk.length - 1} acked ${data.acked.length}/${chunk.length}`,
      );
    }
    ackedTotal += data.acked.length;
    console.log(`  pushed ${Math.min(i + chunk.length, changes.length)}/${changes.length}`);
  }
  return ackedTotal;
}

async function main() {
  loadDotEnv();

  const slug = process.argv[2]?.trim();
  const workbookArg = process.argv[3]?.trim();
  if (!slug || !workbookArg) {
    console.error(
      'Usage: node scripts/import-kitchen-items.mjs <tenant_slug> <path-to-Kitchen-Items.xlsx>',
    );
    console.error(
      'Example: node scripts/import-kitchen-items.mjs nisarg_hotel "C:\\Users\\mmsol\\Desktop\\Kitchen Items.xlsx"',
    );
    process.exit(1);
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const mobile = process.env.IMPORT_ADMIN_MOBILE?.trim();
  const mpin = process.env.IMPORT_ADMIN_MPIN?.trim();

  if (!url || !anonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  }
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    throw new Error('Set IMPORT_ADMIN_MOBILE in .env to the 10-digit admin mobile');
  }
  if (!mpin || !/^\d{4}$/.test(mpin)) {
    throw new Error('Set IMPORT_ADMIN_MPIN in .env to the 4-digit admin MPIN');
  }

  const tenant = loadTenant(slug);
  const workbookPath = path.resolve(workbookArg);
  console.log(`Tenant: ${tenant.businessName} (${tenant.tenantId})`);
  console.log(`Workbook: ${workbookPath}`);

  const parsed = readKitchenWorkbook(workbookPath);
  console.log(
    `Parsed ${parsed.types.length} kitchen types, ${parsed.items.length} kitchen items (NA stock fields → not tracked)`,
  );

  const changes = buildChanges(tenant.tenantId, parsed);
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Pushing ${changes.length} sync changes (types → strengths → items)…`);
  const acked = await pushBatches(supabase, mobile, mpin, changes);
  console.log(`Done. Acked ${acked}/${changes.length}.`);
  console.log('On the phone: login / bring app to foreground so it pulls the kitchen catalog.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
