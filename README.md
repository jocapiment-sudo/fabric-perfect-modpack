# Apotheosis — Bedrock add-on and Fabric port

This repository holds two independent implementations of the same design:

| Port | Target | Location | Artefact |
| --- | --- | --- | --- |
| **Bedrock add-on** | Minecraft Bedrock 1.20.80+ (Script API, BP + RP) | repository root | [`release/Apotheosis.mcaddon`](release/Apotheosis.mcaddon) |
| **Fabric mod** | Minecraft Java 1.20.1, Fabric Loader 0.14.22+, Java 17 | [`fabric/`](fabric) | [`release/apotheosis-fabric-1.20.1.jar`](release/apotheosis-fabric-1.20.1.jar) |

The Fabric port has its own [README](fabric/README.md) covering build, install
and design notes. Everything below documents the Bedrock add-on.

---

# Apotheosis — Bedrock Edition

An add-on for **Minecraft: Bedrock Edition 1.20.80+** that rebuilds the core of the Java
mod [Apotheosis](https://www.curseforge.com/minecraft/mc-mods/apotheosis): gear rarity,
random affixes, affix bosses, tunable mob spawners, and a reforging altar with a full
scripted UI.

Everything is implemented with the Bedrock **Script API** (`@minecraft/server` 1.10.0 and
`@minecraft/server-ui` 1.1.0) plus a behaviour pack and a resource pack — no experimental
gameplay toggles required.

```
Keen Diamond Sword of the Berserker
+12% critical strike chance
+9% lifesteal
2 / 3 affix slots · Rare · iLvl 24
```

---

## What it does

### 1. Rarity and affixes

Five rarities — **Common, Uncommon, Rare, Epic, Mythic** — each granting more affix slots
and stronger rolls. Twenty-four affixes (prefixes and suffixes) roll onto gear, and the
item's name is rebuilt as `[prefix] base [suffix]`, coloured by rarity, with every affix
listed in the lore.

| Rarity | Affix slots | How you get it |
| --- | --- | --- |
| Common | 0 | drops, reforges |
| Uncommon | 1 | elite drops, orbs |
| Rare | 2 | elite drops, orbs |
| Epic | 3 | elite drops, orbs |
| Mythic | 4 | elite drops, orbs |

Rarity is stored **on the item** (dynamic properties), so an affixed sword keeps its
affixes when traded, stored in a chest, or dropped on the ground.

### 2. Affix bosses

Five elite mobs — a Zombie Brute, a Husk Juggernaut, a Skeleton Ranger, a Stray Sorcerer and
a Drowned Champion — spawn with boosted health, enchanted gear, a rarity-coloured name and a
particle aura. They drop high-rarity affix weapons and rarer materials, and they fight harder
once enraged. Naturally-spawned undead have a small chance to be promoted into an elite, and
an **Affix Effigy** summons one on demand.

### 3. Spawner control

Bind a vanilla mob spawner with the **Spawner Tuning Fork** to convert it into a scripted
Apotheosis spawner, then open its form to set the mob type, wave delay, mobs per wave, maximum
nearby mobs, activation range, particle effects and the chance that a wave spawns an elite
instead. Settings persist across restarts.

### 4. The Reforging Altar

A craftable block that opens an `ActionFormData`/`ModalFormData` interface when right-clicked
with the **Reforging Hammer**: reforge affixes, upgrade rarity (spending an orb), socket an
affix gem into a free socket, infuse a blank gem, inspect the held item's computed stats, or
salvage it back into Arcane Dust.

---

## Quick start

1. Install the add-on — grab **[`release/Apotheosis.mcaddon`](release/Apotheosis.mcaddon)** and
   open it with Minecraft, or follow **[docs/INSTALL.md](docs/INSTALL.md)** for the manual /
   dedicated-server route.
2. Enable the pack on your world. Scripting is on by default; you do **not** need
   "Beta APIs" unless you re-point the manifest at a beta module version.
3. Run `/scriptevent apoth:give kit` with cheats enabled to get a hammer, a fork, the codex,
   dust, orbs, gems and an effigy to try everything.

Full gameplay reference: **[docs/MECHANICS.md](docs/MECHANICS.md)** ·
Generated affix tables: **[docs/AFFIXES.md](docs/AFFIXES.md)**

## Item cheat-sheet

| Item | Use |
| --- | --- |
| Reforging Hammer | Right-click a Reforging Altar to open the forge |
| Spawner Tuning Fork | Right-click a mob spawner to bind/configure it |
| Codex of Affixes | Right-click to open the in-game handbook |
| Affix Gem | Socketed at the altar (costs 2 dust + 1 level) |
| Arcane Dust | Currency for reforge / upgrade / socket / infuse |
| Rarity Orb | Consumed by the matching rarity upgrade |
| Affix Effigy | Right-click to summon a random affix boss |
| Bloodforged Blade / Dread Cleaver | Elite weapons dropped by the higher-tier bosses |

## Commands

Cheats must be enabled; these are script events so they work from chat as
`/scriptevent <id> [message]`.

| Command | Effect |
| --- | --- |
| `/scriptevent apoth:help` | List every command |
| `/scriptevent apoth:status` | Live elites, configured spawners, current settings |
| `/scriptevent apoth:give <hammer\|fork\|codex\|effigy\|dust\|orb\|gem\|gear\|blankgem\|kit> [args]` | Spawn add-on items |
| `/scriptevent apoth:summon <uncommon\|rare\|epic\|mythic>` | Summon an elite next to you |
| `/scriptevent apoth:config [key] [value]` | Read/write `naturalelites`, `elitechance`, `maxelites`, `spawnerchance`, `reset` |

Examples:

```
/scriptevent apoth:give gem berserker epic
/scriptevent apoth:give gear mythic weapon
/scriptevent apoth:config elitechance 0.08
/scriptevent apoth:summon mythic
```

## Project layout

```
apotheosis_bp/                 behaviour pack (what the game loads)
  manifest.json                data + script modules, RP dependency
  entities/                    5 elite mob definitions
  items/                       12 custom items
  blocks/                      reforging altar + affix spawner
  loot_tables/                 elite drops, gear tables, block drops
  recipes/                     12 crafting recipes
  scripts/main.js              compiled bundle (build output — do not edit)
apotheosis_rp/                 resource pack
  entity/                      client entities (vanilla models, custom animations)
  animations/                  humanoid idle/walk
  render_controllers/
  textures/items|blocks/       generated PNGs
  texts/en_US.lang
src/                           TypeScript source
  core/                        rarity, affixes, naming, stats, item data, elites
  systems/                     equipment, combat, bosses, spawner, altar, interactions, commands
  ui/                          altar, spawner, codex forms + shared form helpers
  util/                        random, text, storage, feedback
tools/                         validate, package, texture + doc generators
docs/                          install, mechanics, generated affix reference
```

## Development

```bash
npm install
npm run build        # bundle src/ -> apotheosis_bp/scripts/main.js (esbuild, ESM)
npm run typecheck    # tsc --noEmit against the real @minecraft/server typings
npm run validate     # cross-pack consistency checks (see tools/validate.mjs)
npm run textures     # regenerate every PNG from tools/generate_textures.py (needs Pillow)
npm run docs:affixes # regenerate docs/AFFIXES.md from the TypeScript source
npm run package      # build + dist/Apotheosis.mcaddon, BP and RP .mcpack files
npm run ci           # typecheck + build + validate
```

The bundle keeps `@minecraft/server` and `@minecraft/server-ui` as externals; Bedrock
provides those modules at runtime. `apotheosis_bp/scripts/main.js` is a build artifact and is
committed so the pack works without a toolchain.

### Architecture notes

* `systems/equipment.ts` scans equipped gear every 10 ticks and mirrors passive stats onto
  the player as vanilla status effects, refreshing them every 40 ticks so they never visibly
  expire. Combat-only stats (crit, lifesteal, ignite, thorns, knockback resistance) are
  resolved by `systems/combat.ts` in `entityHurt`.
* Immutable items are mutated by constructing a fresh `ItemStack` and writing it back to the
  slot — Bedrock item stacks cannot be edited in place.
* All item payloads are JSON in the `apoth:item` / `apoth:gem` dynamic properties and are
  versioned (`v`), so a future format change can migrate instead of silently breaking gear.
* Spawner settings live in one world dynamic property (`apoth:spawners`) behind a debounced
  writer to avoid hitting the per-tick write cost.

### Why it differs from the Java mod

Bedrock's API surface forces a few design choices; they are documented in
[docs/MECHANICS.md](docs/MECHANICS.md#bedrock-limits) but in short:

| Java Apotheosis | Here |
| --- | --- |
| Attribute modifiers on items | Status-effect bridge + scripted combat hooks |
| NBT-driven spawners | Custom `apotheosis:affix_spawner` block simulated by script |
| Item NBT | Item dynamic properties (`apoth:item`) |
| Custom GUI screens | `ActionFormData` / `ModalFormData` forms |

## License

MIT — see [LICENSE](LICENSE). Not affiliated with the Apotheosis Java mod or Mojang.
