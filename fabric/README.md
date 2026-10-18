# Apotheosis: Fabric Edition

A Fabric port of the core Apotheosis loop for **Minecraft 1.20.1** (Java 17):
rarity tiers, random affixes with dynamic names and lore, elite affix bosses,
item-driven mob-spawner tuning, and a reforging altar for re-rolls, rarity
upgrades and gem socketing.

* **Loader:** Fabric Loader 0.14.22+
* **Dependency:** Fabric API (only)
* **Java:** 17 (class file version 61)
* **Mixins:** none — see [Why no mixins](#why-no-mixins)
* **Output:** `dist/apotheosis-fabric-1.20.1.jar`

---

## Build

### One command (recommended)

```bash
./build.sh          # Linux / macOS
.\build.ps1         # Windows PowerShell
```

The script checks for a JDK 17, downloads Gradle 8.5 into `.gradle-dist/` if
Gradle is not on `PATH`, runs the Loom build, and copies the result to
`dist/apotheosis-fabric-1.20.1.jar`. The first run downloads Minecraft 1.20.1,
Yarn mappings and Fabric API (~200 MB) and takes a few minutes; later builds are
incremental.

### Manually, with your own Gradle

```bash
gradle build          # requires Gradle 8.x and JDK 17
```

The jar appears at `build/libs/apotheosis-fabric-1.20.1.jar` (and is copied to
`dist/` by the `copyToDist` task).

### From CI

`.github/workflows/fabric-build.yml` builds the jar on every push that touches
`fabric/` and uploads it as the `apotheosis-fabric-jar` artifact.

---

## Install

1. Install **Fabric Loader 0.14.22+** for Minecraft **1.20.1**.
2. Put **Fabric API** (any 1.20.1 build) in `mods/`.
3. Put `apotheosis-fabric-1.20.1.jar` in `mods/`.
4. Launch. The log shows `Apotheosis initialised: 5 rarities, 13 affixes, 0 mixins`.

No experimental flags, no config required (a `config/apotheosis.json` is created
on first launch).

---

## Playing

### Getting started

```
/apotheosis give hammer     # Reforging Hammer
/apotheosis give dust       # 16 Arcane Dust
/apotheosis give gem        # a random affix gem
/apotheosis gear rare       # a test item at a given rarity
```

Or craft them: the altar is `obsidian / amethyst / diamond` in a ring
(`OAO / ADA / OAO`), the hammer is `III / IAS / ·S·`.

### The Reforging Altar

Place it, then right-click with **the item you want to change in your main hand**
and **a catalyst in your off hand**. Either hand order works — the altar swaps
them if the catalyst is in your main hand.

| Catalyst (off hand) | Action | Cost |
| --- | --- | --- |
| Reforging Hammer | Re-roll every affix | rarity dust + XP levels |
| Arcane Dust | Upgrade one rarity tier | 1.5× dust + XP levels |
| Affix Gem | Socket the gem's affix permanently | the gem |
| Codex of Affixes | Inspect the item's computed stats | free |

Unattuned gear (any vanilla sword, axe or armour piece) gets a **random rarity
and its first affix set** the first time you reforge it — that is the entry point
into the system.

### Rarity and affixes

| Rarity | Colour | Affix slots | Gems |
| --- | --- | --- | --- |
| Common | grey `§7` | 0 | 1 |
| Uncommon | blue `§9` | 1 | 2 |
| Rare | green `§a` | 2 | 3 |
| Epic | purple `§5` | 3 | 4 |
| Mythic | gold `§6` | 4 | 5 |

Thirteen affixes cover the requested stat set:

* **Passive attributes** — max health, attack damage, movement speed, knockback resistance.
* **Combat procs** — critical chance, critical damage, lifesteal, thorns, ignite, frost.

Names follow the Java mod's pattern: `Keen Diamond Sword of the Berserker`, with
every affix, its rolled value and the socket list in the lore.

### Affix bosses

Any zombie, skeleton, wither skeleton or drowned has a **4 %** chance to be
promoted on spawn (`/apotheosis config promotionchance 1` to test). A promoted
mob gets:

* **+200 %** max health (a `MULTIPLY_TOTAL` attribute modifier, not a heal),
* a coloured, always-visible name from a pool of nine,
* permanent Glowing,
* a full affixed armour set and an affixed weapon appropriate to its rarity,
* a guaranteed **Epic or Mythic** drop (30 % Mythic) plus Arcane Dust on death.

### Spawner tuning

Right-click a vanilla mob spawner holding:

| Item | Effect |
| --- | --- |
| Feather | −40 ticks between waves (floor 20) |
| Gunpowder | +1 mob per wave (max 16) |
| Fermented Spider Eye | +4 max nearby mobs (max 64) |
| Sugar | +1 spawn radius (max 8) |
| Nether Star | 5-minute **elite surge**: spawns in the area are promoted |

### Commands

All operator-only (`/apotheosis help`):

```
/apotheosis give <hammer|codex|dust|gem [affix]>
/apotheosis gear <common|uncommon|rare|epic|mythic>
/apotheosis reforge | upgrade | inspect      (acts on the held item)
/apotheosis config promotionchance <0-1>
/apotheosis config healthbonus <0-20>
```

---

## How it works

### The NBT payload

Every affixed item carries one compound, so state travels with the stack through
trading, chests and restarts:

```snbt
{ ApotheosisData: {
    Version: 1, Rarity: "rare", Level: 24,
    Affixes: [ { Id: "keen", Value: 0.12d } ],
    Gems:    [ { Id: "vampiric", Value: 0.05d } ]
} }
```

Rolled values are stored, not recomputed, so rebalancing the affix table never
retroactively changes gear that already exists in a world.

### Attributes

Passive stats are applied as player attribute modifiers with **fixed UUIDs**,
reconciled once per second and removed when the item is unequipped. Writing
`AttributeModifiers` into the item's NBT would be the "vanilla" approach, but
vanilla only re-reads item modifiers on specific inventory syncs — a reforge
would silently not take effect until the item moved. Direct modifiers are
deterministic and idempotent.

### Why no mixins

Every hook is a public Fabric API event (`ServerEntityEvents.ENTITY_LOAD`,
`ServerLivingEntityEvents.AFTER_DAMAGE`, `UseBlockCallback`,
`CommandRegistrationCallback`, `ServerTickEvents`) or a vanilla API call.

The spawner feature is the interesting case: instead of a
`MobSpawnerBlockEntity` mixin, the mod reads the block entity's NBT, edits
`Delay` / `MinSpawnDelay` / `MaxSpawnDelay` / `SpawnCount` /
`MaxNearbyEntities` / `SpawnRange`, and writes it back — the same fields a mixin
would touch, with no bytecode transformation and therefore no possible conflict
with other mods.

### Why the altar is item-driven

A custom `ScreenHandler` needs a client-side screen, a texture, and a sync
packet per action. The item-in-hand model is entirely server-side, cannot
desync, and works with any resource pack.

---

## Known limits

* **Elite promotion is spawn-time only.** A mob that loaded before the mod was
  installed will not be promoted retroactively.
* **Elite surges are in-memory.** They survive dimension changes but not a
  server restart (the spawner's own tuning is written to NBT and does survive).
* **No custom GUI.** See above; the altar is deliberately interaction-based.
* **Balance is tuned for a survival server**, not PvP: caps are 100 % crit,
  50 % lifesteal, 90 % knockback resistance.

## Layout

```
fabric/
  build.sh / build.ps1         one-command build
  build.gradle / gradle.properties / settings.gradle
  src/main/java/dev/apotheosis/
    ApotheosisMod.java         entry point
    ApotheosisConfig.java      config/apotheosis.json
    core/                      rarity, affixes, NBT payload, naming, stats, factory
    registry/                  item + block registration
    block/                     ReforgingAltarBlock
    system/                    attributes, combat, elites, spawners, reforging
    command/                   /apotheosis
  src/main/resources/          fabric.mod.json, models, textures, lang, loot table
```
