#!/usr/bin/env node
/**
 * ============================================================================
 *  Add-on validator
 * ============================================================================
 *  Runs after every build in CI. It deliberately does not try to be a full
 *  Bedrock JSON-schema checker (the game itself is the final authority); it
 *  catches the mistakes that actually bite during add-on development:
 *
 *    - malformed JSON in either pack,
 *    - a missing / mismatched manifest UUID (BP must depend on the RP header),
 *    - a manifest whose engine or module versions drifted from the target,
 *    - items that point at a texture key that does not exist,
 *    - blocks that point at an atlas key that does not exist,
 *    - every referenced loot table / recipe result resolving to a real file,
 *    - entity loot tables pointing at missing gear tables,
 *    - textures declared in an atlas without a PNG on disk,
 *    - `.lang` keys that do not correspond to a real item / block / entity,
 *    - leftover debug-script markers in the compiled bundle.
 *
 *  Exit code 0 means "safe to package"; any failure prints every problem it
 *  found (not just the first) so a single run is enough to fix a batch.
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BP = join(ROOT, 'apotheosis_bp');
const RP = join(ROOT, 'apotheosis_rp');

const problems = [];
const notes = [];

/** Record a failure with enough context to locate it. */
function fail(where, message) {
  problems.push(`${where}: ${message}`);
}

function note(message) {
  notes.push(message);
}

/** Recursively list files, skipping nothing (packs are small). */
function walk(dir, filter = () => true) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(relative(ROOT, file), `invalid JSON (${error.message})`);
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Every JSON file must parse                                              */
/* -------------------------------------------------------------------------- */
const jsonFiles = [...walk(BP, (f) => f.endsWith('.json')), ...walk(RP, (f) => f.endsWith('.json'))];
for (const file of jsonFiles) readJson(file);
note(`${jsonFiles.length} JSON files parsed`);

/* -------------------------------------------------------------------------- */
/* 2. Manifests                                                               */
/* -------------------------------------------------------------------------- */
const bpManifest = readJson(join(BP, 'manifest.json'));
const rpManifest = readJson(join(RP, 'manifest.json'));

function checkManifest(manifest, label, expectedKind) {
  if (!manifest) return;
  const header = manifest.header ?? {};
  if (!header.uuid) fail(`${label}/manifest.json`, 'header.uuid is missing');
  if (!header.version) fail(`${label}/manifest.json`, 'header.version is missing');
  if (!Array.isArray(header.min_engine_version)) {
    fail(`${label}/manifest.json`, 'header.min_engine_version must be an array');
  } else if (header.min_engine_version.join('.') !== '1.20.80') {
    fail(`${label}/manifest.json`, `min_engine_version is ${header.min_engine_version.join('.')}, expected 1.20.80`);
  }
  const modules = manifest.modules ?? [];
  if (modules.length === 0) fail(`${label}/manifest.json`, 'has no modules');
  const kinds = modules.map((m) => m.type);
  if (!kinds.includes(expectedKind)) {
    fail(`${label}/manifest.json`, `expected a "${expectedKind}" module, found [${kinds.join(', ')}]`);
  }
  for (const module of modules) {
    if (!module.uuid) fail(`${label}/manifest.json`, `module "${module.type}" has no uuid`);
    if (!module.version) fail(`${label}/manifest.json`, `module "${module.type}" has no version`);
  }
  return header.uuid;
}

const bpUuid = checkManifest(bpManifest, 'apotheosis_bp', 'data');
const rpUuid = checkManifest(rpManifest, 'apotheosis_rp', 'resources');

if (bpUuid && rpUuid) {
  const deps = bpManifest.dependencies ?? [];
  const hasRp = deps.some((dep) => dep.uuid === rpUuid);
  if (!hasRp) fail('apotheosis_bp/manifest.json', `dependencies does not include the resource pack header (${rpUuid})`);
  for (const [module, expected] of [
    ['@minecraft/server', '1.10.0'],
    ['@minecraft/server-ui', '1.1.0'],
  ]) {
    const dep = deps.find((d) => d.module_name === module);
    if (!dep) fail('apotheosis_bp/manifest.json', `missing script dependency ${module}`);
    else if (dep.version !== expected) fail('apotheosis_bp/manifest.json', `${module} version is ${dep.version}, expected ${expected}`);
  }
}
note(`manifest UUIDs: BP ${bpUuid}, RP ${rpUuid}`);

/* -------------------------------------------------------------------------- */
/* 3. Scripts entry point                                                     */
/* -------------------------------------------------------------------------- */
if (bpManifest) {
  const scriptModule = (bpManifest.modules ?? []).find((m) => m.type === 'script');
  if (!scriptModule) fail('apotheosis_bp/manifest.json', 'no script module (the add-on is useless without it)');
  else {
    const entry = join(BP, scriptModule.entry ?? '');
    if (!existsSync(entry)) fail('apotheosis_bp/manifest.json', `script entry "${scriptModule.entry}" does not exist`);
    else {
      const source = readFileSync(entry, 'utf8');
      for (const marker of ['console.log("[Apotheosis] DEBUG', 'TODO:', 'FIXME:']) {
        if (source.includes(marker)) fail(relative(ROOT, entry), `contains debug marker "${marker}"`);
      }
      for (const dependency of ['@minecraft/server', '@minecraft/server-ui']) {
        if (!source.includes(`from "${dependency}"`) && !source.includes(`from '${dependency}'`)) {
          fail(relative(ROOT, entry), `does not import ${dependency} (did esbuild inline it by mistake?)`);
        }
      }
      const kb = (statSync(entry).size / 1024).toFixed(0);
      note(`bundle ${scriptModule.entry} is ${kb} KB`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Item definitions -> icon atlas                                          */
/* -------------------------------------------------------------------------- */
const iconAtlas = readJson(join(RP, 'textures', 'item_texture.json'))?.texture_data ?? {};
const itemFiles = walk(join(BP, 'items'), (f) => f.endsWith('.json'));
const itemIds = new Set();

for (const file of itemFiles) {
  const data = readJson(file);
  const definition = data?.['minecraft:item'];
  if (!definition) {
    fail(relative(ROOT, file), 'missing "minecraft:item" root key');
    continue;
  }
  const id = definition.description?.identifier;
  if (!id) {
    fail(relative(ROOT, file), 'description.identifier is missing');
    continue;
  }
  itemIds.add(id);
  const components = definition.components ?? {};
  const icon = components['minecraft:icon'];
  const textureKey = typeof icon === 'string' ? icon : icon?.texture;
  if (!textureKey) {
    fail(relative(ROOT, file), `${id} has no minecraft:icon`);
  } else if (!iconAtlas[textureKey]) {
    fail(relative(ROOT, file), `${id} uses texture key "${textureKey}" that is not in item_texture.json`);
  }
  // Every item needs a display name or it shows as a raw identifier in the
  // inventory (the .lang file also provides one, but the component wins).
  if (!components['minecraft:display_name']?.value) {
    fail(relative(ROOT, file), `${id} has no display_name component`);
  }
}
note(`${itemFiles.length} items checked`);

/* -------------------------------------------------------------------------- */
/* 5. Block definitions -> terrain atlas + loot tables                        */
/* -------------------------------------------------------------------------- */
const terrainAtlas = readJson(join(RP, 'textures', 'terrain_texture.json'))?.texture_data ?? {};
const blockFiles = walk(join(BP, 'blocks'), (f) => f.endsWith('.json'));
const blockIds = new Set();

for (const file of blockFiles) {
  const data = readJson(file);
  const definition = data?.['minecraft:block'];
  if (!definition) {
    fail(relative(ROOT, file), 'missing "minecraft:block" root key');
    continue;
  }
  const id = definition.description?.identifier;
  if (!id) {
    fail(relative(ROOT, file), 'description.identifier is missing');
    continue;
  }
  blockIds.add(id);
  const components = definition.components ?? {};
  const materials = components['minecraft:material_instances'] ?? {};
  for (const [face, instance] of Object.entries(materials)) {
    const key = instance?.texture;
    if (!key) fail(relative(ROOT, file), `material "${face}" has no texture`);
    else if (!terrainAtlas[key]) fail(relative(ROOT, file), `material "${face}" uses "${key}" that is not in terrain_texture.json`);
  }
  const loot = components['minecraft:loot'];
  if (loot && !existsSync(join(BP, loot))) fail(relative(ROOT, file), `loot table "${loot}" does not exist`);
}
note(`${blockFiles.length} blocks checked`);

/* -------------------------------------------------------------------------- */
/* 6. Atlases -> PNGs on disk                                                 */
/* -------------------------------------------------------------------------- */
function checkAtlas(name, atlas, folder) {
  let checked = 0;
  for (const [key, value] of Object.entries(atlas)) {
    const entries = Array.isArray(value.textures) ? value.textures : [value.textures];
    for (const path of entries) {
      if (typeof path !== 'string') {
        fail(name, `"${key}" has a non-string texture path`);
        continue;
      }
      const png = join(RP, `${path}.png`);
      if (!existsSync(png)) fail(name, `"${key}" points at missing ${path}.png`);
      checked++;
    }
  }
  note(`${name}: ${checked} texture paths`);
}
checkAtlas('textures/item_texture.json', iconAtlas, 'items');
checkAtlas('textures/terrain_texture.json', terrainAtlas, 'blocks');

// The `blocks.json` sound map should only mention blocks we actually define.
const rpBlocks = readJson(join(RP, 'blocks.json')) ?? {};
for (const key of Object.keys(rpBlocks)) {
  if (key.startsWith('format_version')) continue;
  if (!blockIds.has(key)) fail('apotheosis_rp/blocks.json', `references unknown block "${key}"`);
}

/* -------------------------------------------------------------------------- */
/* 7. Entities -> geometry / animation / loot tables                          */
/* -------------------------------------------------------------------------- */
const entityFiles = walk(join(BP, 'entities'), (f) => f.endsWith('.json'));
const entityIds = new Set();

for (const file of entityFiles) {
  const data = readJson(file);
  const definition = data?.['minecraft:entity'];
  if (!definition) {
    fail(relative(ROOT, file), 'missing "minecraft:entity" root key');
    continue;
  }
  const id = definition.description?.identifier;
  if (!id) {
    fail(relative(ROOT, file), 'description.identifier is missing');
    continue;
  }
  entityIds.add(id);
  const components = definition.components ?? {};

  const loot = components['minecraft:loot']?.table;
  if (loot && !existsSync(join(BP, loot))) fail(relative(ROOT, file), `loot table "${loot}" does not exist`);

  const gear = components['minecraft:equipment']?.table;
  if (gear && !existsSync(join(BP, gear))) fail(relative(ROOT, file), `equipment table "${gear}" does not exist`);

  const health = components['minecraft:health'];
  if (!health || health.value <= 0) fail(relative(ROOT, file), 'has no positive minecraft:health');

  // Client entity must exist, otherwise the mob is invisible.
  const client = join(RP, 'entity', `${file.split('/').pop().replace(/\.json$/, '')}.entity.json`);
  if (!existsSync(client)) {
    fail(relative(ROOT, file), `no matching client entity at apotheosis_rp/entity/${file.split('/').pop().replace(/\.json$/, '')}.entity.json`);
    continue;
  }
  const clientData = readJson(client)?.['minecraft:client_entity']?.description ?? {};
  // Elites intentionally reuse vanilla entity textures (they resolve from the
  // vanilla resource pack), so only paths we are supposed to ship are checked.
  for (const [slot, path] of Object.entries(clientData.textures ?? {})) {
    if (!path.startsWith('textures/')) continue; // vanilla asset, resolved by the game
    if (!path.startsWith('textures/items/') && !path.startsWith('textures/blocks/')) continue;
    if (!existsSync(join(RP, `${path}.png`))) fail(relative(ROOT, client), `texture "${slot}" points at missing ${path}.png`);
  }
  const animations = Object.keys(clientData.animations ?? {});
  if (animations.length === 0) fail(relative(ROOT, client), 'defines no animations');
  if (!clientData.render_controllers?.length) fail(relative(ROOT, client), 'defines no render controller');
  if (!clientData.spawn_egg) fail(relative(ROOT, client), 'defines no spawn egg (mob cannot be found in creative)');
}
note(`${entityFiles.length} entities checked`);

/* -------------------------------------------------------------------------- */
/* 8. Animations / render controllers resolve                                 */
/* -------------------------------------------------------------------------- */
const allRpAnimationKeys = new Set();
for (const file of walk(join(RP, 'animations'), (f) => f.endsWith('.json'))) {
  const animations = readJson(file)?.animations ?? {};
  for (const key of Object.keys(animations)) allRpAnimationKeys.add(key);
}
const allRenderControllers = new Set();
for (const file of walk(join(RP, 'render_controllers'), (f) => f.endsWith('.json'))) {
  const controllers = readJson(file)?.render_controllers ?? {};
  for (const key of Object.keys(controllers)) allRenderControllers.add(key);
}

for (const file of walk(join(RP, 'entity'), (f) => f.endsWith('.json'))) {
  const description = readJson(file)?.['minecraft:client_entity']?.description ?? {};
  for (const [slot, animation] of Object.entries(description.animations ?? {})) {
    if (animation.startsWith('animation.') && !allRpAnimationKeys.has(animation)) {
      fail(relative(ROOT, file), `animation "${slot}" -> "${animation}" is not defined`);
    }
  }
  for (const controller of description.render_controllers ?? []) {
    if (!allRenderControllers.has(controller)) {
      fail(relative(ROOT, file), `render controller "${controller}" is not defined`);
    }
  }
}
note(`${allRpAnimationKeys.size} animations, ${allRenderControllers.size} render controllers`);

/* -------------------------------------------------------------------------- */
/* 9. Recipes resolve both ways                                               */
/* -------------------------------------------------------------------------- */
const recipeFiles = walk(join(BP, 'recipes'), (f) => f.endsWith('.json'));
const knownIds = new Set([...itemIds, ...blockIds]);

for (const file of recipeFiles) {
  const data = readJson(file);
  const recipe = data?.['minecraft:recipe_shaped'] ?? data?.['minecraft:recipe_shapeless'];
  if (!recipe) {
    fail(relative(ROOT, file), 'is neither a shaped nor a shapeless recipe');
    continue;
  }
  const result = recipe.result;
  const results = Array.isArray(result) ? result : [result];
  for (const entry of results) {
    if (!entry?.item) fail(relative(ROOT, file), 'result has no item');
    else if (entry.item.startsWith('apotheosis:') && !knownIds.has(entry.item)) {
      fail(relative(ROOT, file), `result "${entry.item}" is not a defined item/block`);
    }
  }
  const ingredients = recipe.ingredients ?? Object.values(recipe.key ?? {}).flat();
  if (ingredients.length > 9) fail(relative(ROOT, file), `${ingredients.length} ingredients do not fit a 3x3 grid`);
  for (const ingredient of ingredients) {
    if (!ingredient?.item) fail(relative(ROOT, file), 'ingredient has no item');
    else if (ingredient.item.startsWith('apotheosis:') && !knownIds.has(ingredient.item)) {
      fail(relative(ROOT, file), `ingredient "${ingredient.item}" is not a defined item/block`);
    }
  }
  if (recipe.tags && !recipe.tags.includes('crafting_table')) {
    fail(relative(ROOT, file), 'recipe is not available in the crafting table');
  }
}
note(`${recipeFiles.length} recipes checked`);

// Every item should be obtainable: either crafted, dropped by an elite, or admin-only.
const crafted = new Set();
for (const file of recipeFiles) {
  const data = readJson(file);
  const recipe = data?.['minecraft:recipe_shaped'] ?? data?.['minecraft:recipe_shapeless'];
  const result = recipe?.result;
  for (const entry of Array.isArray(result) ? result : [result]) if (entry?.item) crafted.add(entry.item);
}
const dropped = new Set();
for (const file of walk(join(BP, 'loot_tables'), (f) => f.endsWith('.json'))) {
  const text = readFileSync(file, 'utf8');
  for (const id of knownIds) if (text.includes(`"${id}"`)) dropped.add(id);
}
for (const id of itemIds) {
  if (!crafted.has(id) && !dropped.has(id)) note(`obtainability: ${id} is only available through /scriptevent apoth:give`);
}

/* -------------------------------------------------------------------------- */
/* 10. Language keys                                                          */
/* -------------------------------------------------------------------------- */
const langFile = join(RP, 'texts', 'en_US.lang');
if (!existsSync(langFile)) {
  fail('apotheosis_rp/texts/en_US.lang', 'missing (items and mobs will show raw identifiers)');
} else {
  const text = readFileSync(langFile, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('##') || !line.includes('=')) continue;
    const [key] = line.split('=');
    const [, type, id] = key.match(/^(item|tile|entity)\.(.+?)(?:\.name)?$/) ?? [];
    if (!id) {
      fail('texts/en_US.lang', `unrecognised key "${key}"`);
      continue;
    }
    if (type === 'item' && id.startsWith('apotheosis:') && !itemIds.has(id)) {
      fail('texts/en_US.lang', `key "${id}" has no matching item definition`);
    }
    if (type === 'tile' && id.startsWith('apotheosis:') && !blockIds.has(id)) {
      fail('texts/en_US.lang', `key "${id}" has no matching block definition`);
    }
    if (type === 'entity' && id.startsWith('apotheosis:') && !entityIds.has(id)) {
      fail('texts/en_US.lang', `key "${id}" has no matching entity definition`);
    }
  }
  note('en_US.lang keys resolved');
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */
console.log('\nApotheosis add-on validation');
console.log('─'.repeat(60));
for (const line of notes) console.log(`  · ${line}`);

if (problems.length === 0) {
  console.log('\n✔ All checks passed.\n');
  process.exit(0);
}

console.error(`\n✖ ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`);
for (const problem of problems) console.error(`  · ${problem}`);
console.error('');
process.exit(1);
