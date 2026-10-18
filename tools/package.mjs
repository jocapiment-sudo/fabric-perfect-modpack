#!/usr/bin/env node
/**
 * ============================================================================
 *  Packager
 * ============================================================================
 *  Produces the three files a player actually installs:
 *
 *    dist/Apotheosis_BP.mcpack   behaviour pack only
 *    dist/Apotheosis_RP.mcpack   resource pack only
 *    dist/Apotheosis.mcaddon     both packs, in the correct import order
 *
 *  Zip handling is implemented here (with Node's zlib) instead of shelling out
 *  to `zip` so that `npm run package` works identically on Windows, macOS and
 *  Linux without extra tooling.
 *
 *  A .mcpack is a zip whose *root* contains manifest.json.
 *  A .mcaddon is a zip that contains the two pack folders side by side.
 * ============================================================================
 */

import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIST = join(ROOT, 'dist');

/* -------------------------------------------------------------------------- */
/* Minimal zip writer                                                         */
/* -------------------------------------------------------------------------- */

/** CRC-32 (IEEE 802.3) lookup table, built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, which zip uses for the per-entry timestamp. */
function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Build a zip archive from `[{ name, data }]` where `name` uses forward
 * slashes and `data` is a Buffer. Directories are implied by file names.
 */
function createZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  const { time, day } = dosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const compressed = deflateRawSync(raw, { level: 9 });
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(0x0800, 6); // general purpose flags: UTF-8 names
    local.writeUInt16LE(8, 8); // compression method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    localChunks.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // offset of the local header

    centralChunks.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, centralDirectory, end]);
}

/* -------------------------------------------------------------------------- */
/* Collect pack files                                                         */
/* -------------------------------------------------------------------------- */

/** Files that should never ship inside a pack. */
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function collect(dir, prefix = '') {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const archiveName = `${prefix}${name}`.split(sep).join('/');
    if (statSync(full).isDirectory()) entries.push(...collect(full, `${archiveName}/`));
    else entries.push({ name: archiveName, data: readFileSync(full) });
  }
  return entries;
}

/** Warn about anything a pack should not contain. */
function audit(dir, label) {
  const files = collect(dir);
  if (files.length === 0) throw new Error(`${label} is empty — run the build first`);
  if (!files.some((file) => file.name === 'manifest.json')) {
    throw new Error(`${label}/manifest.json is missing`);
  }
  if (files.some((file) => file.name.endsWith('.psd') || file.name.endsWith('.xcf'))) {
    throw new Error(`${label} contains source art files (psd/xcf); remove them before packaging`);
  }
  return files;
}

/* -------------------------------------------------------------------------- */
/* Emit                                                                       */
/* -------------------------------------------------------------------------- */

if (!existsSync(join(ROOT, 'apotheosis_bp', 'scripts', 'main.js'))) {
  console.error('✖ apotheosis_bp/scripts/main.js is missing — run `npm run build` first.');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });

const bpFiles = audit(join(ROOT, 'apotheosis_bp'), 'apotheosis_bp');
const rpFiles = audit(join(ROOT, 'apotheosis_rp'), 'apotheosis_rp');

const bpZip = createZip(bpFiles);
const rpZip = createZip(rpFiles);
writeFileSync(join(DIST, 'Apotheosis_BP.mcpack'), bpZip);
writeFileSync(join(DIST, 'Apotheosis_RP.mcpack'), rpZip);

// A .mcaddon contains both packs as folders; Minecraft imports both and links
// them through the dependency declared in the behaviour pack manifest.
const addonZip = createZip([
  ...bpFiles.map((file) => ({ name: `Apotheosis_BP/${file.name}`, data: file.data })),
  ...rpFiles.map((file) => ({ name: `Apotheosis_RP/${file.name}`, data: file.data })),
]);
writeFileSync(join(DIST, 'Apotheosis.mcaddon'), addonZip);

const kb = (buffer) => `${(buffer.length / 1024).toFixed(0)} KB`;
console.log('\nPackaged:');
console.log(`  · dist/Apotheosis_BP.mcpack   ${kb(bpZip)}  (${bpFiles.length} files)`);
console.log(`  · dist/Apotheosis_RP.mcpack   ${kb(rpZip)}  (${rpFiles.length} files)`);
console.log(`  · dist/Apotheosis.mcaddon     ${kb(addonZip)}  (both packs, recommended)`);
console.log('');
