/**
 * Import catalog from a per-tenant Excel workbook into Supabase via push_sync_batch.
 *
 * One workbook per tenant, four sheets (imported in this order):
 *   1. item_types      — name, sort_order
 *   2. item_strengths  — name, sort_order
 *   3. vendors         — name, phone
 *   4. items           — catalog rows; item_type / strength must match sheet names;
 *                        service_station is bar | kitchen (Served from on New Item)
 *
 * Usage:
 *   node scripts/import-catalog.mjs nisarg_hotel
 *
 * Requires in .env:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   IMPORT_ADMIN_MOBILE   (10-digit admin mobile for that tenant)
 *   IMPORT_ADMIN_MPIN     (admin MPIN)
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

/** Column order matches the New Item form / create-catalog-template.mjs */
const ITEM_COLUMNS = [
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
];

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

function cleanLabel(value, field, maxLen = 80) {
  const clean = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!clean || clean.length > maxLen) {
    throw new Error(`Invalid ${field}: "${value}"`);
  }
  return clean;
}

function parseItemCode(value) {
  const itemCode = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{2,12}$/.test(itemCode)) {
    throw new Error(`Invalid item_code: "${value}" (need 2–12 A–Z / 0–9)`);
  }
  return itemCode;
}

function parseIntField(value, field, min, max, allowBlank = false) {
  const text = String(value ?? '').trim();
  if (allowBlank && text === '') {
    return null;
  }
  const num = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(num) || num < min || num > max) {
    throw new Error(`Invalid ${field}: "${value}"`);
  }
  return num;
}

function parseMoney(value, field) {
  const text = String(value ?? '')
    .trim()
    .replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Invalid ${field}: "${value}"`);
  }
  return Number(text);
}

function parsePhone(value) {
  const phone = String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (!phone) {
    return '';
  }
  if (!/^\d{10}$/.test(phone)) {
    throw new Error(`Invalid phone: "${value}" (use 10 digits or leave blank)`);
  }
  return phone;
}

function resolveStation(raw, itemType) {
  const station = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (station === 'bar' || station === 'kitchen') {
    return station;
  }
  if (String(itemType).trim().toLowerCase() === 'snacks') {
    return 'kitchen';
  }
  throw new Error(`Invalid service_station: "${raw}" (use bar or kitchen)`);
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

function requireSheet(workbook, name) {
  if (!workbook.SheetNames.includes(name)) {
    throw new Error(`Missing sheet "${name}". Expected: item_types, item_strengths, vendors, items`);
  }
  return workbook.Sheets[name];
}

function sheetRows(sheet, requiredColumns, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (rows.length === 0) {
    return [];
  }
  const first = rows[0];
  for (const col of requiredColumns) {
    if (!(col in first)) {
      throw new Error(`Sheet "${sheetName}" missing column "${col}"`);
    }
  }
  return rows;
}

function parseNamedList(rawRows, sheetName) {
  const out = [];
  const seen = new Set();

  rawRows.forEach((row, index) => {
    const line = index + 2;
    try {
      const nameRaw = String(row.name ?? '').trim();
      if (!nameRaw) {
        return;
      }
      const name = cleanLabel(row.name, 'name', 40);
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`Duplicate name "${name}"`);
      }
      seen.add(key);

      const sortOrder =
        parseIntField(row.sort_order, 'sort_order', 0, 9999, true) ?? out.length;

      out.push({ name, sortOrder });
    } catch (error) {
      throw new Error(`${sheetName} row ${line}: ${error.message}`);
    }
  });

  return out;
}

function parseVendors(rawRows) {
  const out = [];
  const seen = new Set();

  rawRows.forEach((row, index) => {
    const line = index + 2;
    try {
      const nameRaw = String(row.name ?? '').trim();
      if (!nameRaw) {
        return;
      }
      const name = cleanLabel(row.name, 'name', 80);
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`Duplicate vendor "${name}"`);
      }
      seen.add(key);
      out.push({ name, phone: parsePhone(row.phone) });
    } catch (error) {
      throw new Error(`vendors row ${line}: ${error.message}`);
    }
  });

  return out;
}

function parseItems(rawRows, typeNames, strengthNames) {
  const items = [];
  const seenCodes = new Set();
  const typeSet = new Set([...typeNames].map((n) => n.toLowerCase()));
  const strengthSet = new Set([...strengthNames].map((n) => n.toLowerCase()));

  rawRows.forEach((row, index) => {
    const line = index + 2;
    try {
      const blank =
        !String(row.item_code ?? '').trim() && !String(row.name_en ?? '').trim();
      if (blank) {
        return;
      }

      const itemCode = parseItemCode(row.item_code);
      if (seenCodes.has(itemCode)) {
        throw new Error(`Duplicate item_code ${itemCode}`);
      }
      seenCodes.add(itemCode);

      const itemType = cleanLabel(row.item_type, 'item_type', 40);
      const strength = cleanLabel(row.strength, 'strength', 40);
      if (!typeSet.has(itemType.toLowerCase())) {
        throw new Error(
          `item_type "${itemType}" not found in item_types sheet`,
        );
      }
      if (!strengthSet.has(strength.toLowerCase())) {
        throw new Error(
          `strength "${strength}" not found in item_strengths sheet`,
        );
      }

      items.push({
        itemCode,
        nameEn: cleanLabel(row.name_en, 'name_en'),
        nameMr: cleanLabel(row.name_mr, 'name_mr'),
        brand: cleanLabel(row.brand, 'brand'),
        itemType,
        strength,
        serviceStation: resolveStation(row.service_station, itemType),
        volumeMl: parseIntField(row.volume_ml, 'volume_ml', 1, 20000),
        purchasePrice: parseMoney(row.purchase_price, 'purchase_price'),
        sellingPrice: parseMoney(row.selling_price, 'selling_price'),
        lowStockThreshold: parseIntField(
          row.low_stock_threshold,
          'low_stock_threshold',
          0,
          9999,
        ),
        openingStock: parseIntField(row.opening_stock, 'opening_stock', 0, 999999),
      });
    } catch (error) {
      throw new Error(`items row ${line}: ${error.message}`);
    }
  });

  return items;
}

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook not found: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath);

  const types = parseNamedList(
    sheetRows(requireSheet(workbook, 'item_types'), ['name'], 'item_types'),
    'item_types',
  );
  const strengths = parseNamedList(
    sheetRows(requireSheet(workbook, 'item_strengths'), ['name'], 'item_strengths'),
    'item_strengths',
  );
  const vendors = parseVendors(
    sheetRows(requireSheet(workbook, 'vendors'), ['name', 'phone'], 'vendors'),
  );
  const items = parseItems(
    sheetRows(requireSheet(workbook, 'items'), ITEM_COLUMNS, 'items'),
    types.map((t) => t.name),
    strengths.map((s) => s.name),
  );

  if (types.length === 0) {
    throw new Error('item_types sheet has no rows');
  }
  if (strengths.length === 0) {
    throw new Error('item_strengths sheet has no rows');
  }
  if (items.length === 0) {
    throw new Error('items sheet has no rows');
  }

  return { types, strengths, vendors, items };
}

function change(entity, entityId, record) {
  return {
    queue_id: crypto.randomUUID(),
    entity,
    entity_id: entityId,
    operation: 'upsert',
    record,
  };
}

function buildChanges(tenantId, parsed) {
  const now = Date.now();
  const changes = [];

  // 1) Types
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

  // 2) Strengths
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

  // 3) Vendors
  for (const row of parsed.vendors) {
    const id = crypto.randomUUID();
    changes.push(
      change('vendors', id, {
        id,
        tenant_id: tenantId,
        name: row.name,
        phone: row.phone,
        updated_at: now,
      }),
    );
  }

  // 4) Items (+ optional opening stock)
  parsed.items.forEach((item, index) => {
    const id = crypto.randomUUID();
    changes.push(
      change('items', id, {
        id,
        tenant_id: tenantId,
        serial_no: index + 1,
        item_code: item.itemCode,
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

    if (item.openingStock > 0) {
      const movementId = crypto.randomUUID();
      changes.push(
        change('stock_movements', movementId, {
          id: movementId,
          tenant_id: tenantId,
          item_id: id,
          delta: item.openingStock,
          reason: 'adjust',
          source_id: `import:${item.itemCode}`,
          created_at: now + index,
        }),
      );
    }
  });

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
  if (!slug) {
    console.error('Usage: node scripts/import-catalog.mjs <tenant_slug>');
    console.error('Example: node scripts/import-catalog.mjs nisarg_hotel');
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
  const workbookPath = path.join(CATALOG_DIR, tenant.workbook);
  console.log(`Tenant: ${tenant.businessName} (${tenant.tenantId})`);
  console.log(`Workbook: ${workbookPath}`);

  const parsed = readWorkbook(workbookPath);
  console.log(
    `Parsed ${parsed.types.length} types, ${parsed.strengths.length} strengths, ${parsed.vendors.length} vendors, ${parsed.items.length} items`,
  );

  const changes = buildChanges(tenant.tenantId, parsed);
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Pushing ${changes.length} sync changes (types → strengths → vendors → items)…`);
  const acked = await pushBatches(supabase, mobile, mpin, changes);
  console.log(`Done. Acked ${acked}/${changes.length}.`);
  console.log('On the phone: login / bring app to foreground so it pulls the catalog.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
