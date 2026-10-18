# Build verification — `apotheosis-fabric-1.20.1.jar`

This document records what was checked about the shipped jar, how, and what
remains unverified. It exists because "it compiled" is not the same claim as
"it is the artefact you think it is".

## Artefact

| | |
| --- | --- |
| File | `release/apotheosis-fabric-1.20.1.jar` (identical copy in `fabric/dist/`) |
| Size | 72,597 bytes |
| SHA-256 | `7cc5d31fb0ca6b4dec03e5bb7623022ddbdb7c3f72813280f8fd305b2d13da64` |
| Built by | GitHub Actions run [39161864714](https://github.com/jocapiment-sudo/fabric-perfect-modpack/actions/runs/39161864714), from commit `a008c8a` |
| Toolchain | Fabric Loom 1.6.12 · Gradle 8.8 · Temurin JDK 17 · Yarn `1.20.1+build.10` |
| Contents | 75 entries: 29 classes, `fabric.mod.json`, 25 asset files, 10 data files, licence |

Verify the download:

```bash
sha256sum apotheosis-fabric-1.20.1.jar
# 7cc5d31fb0ca6b4dec03e5bb7623022ddbdb7c3f72813280f8fd305b2d13da64
```

## Checks performed

### 1. Bytecode target

All 29 classes were read from the jar and their class-file major version
extracted from the header:

```
classes: 29   bytecode majors: {61: 29}      (61 = Java 17)
```

No class is compiled for a newer JVM, so the jar loads on Java 17 exactly as
specified.

### 2. Entry point

`fabric.mod.json` declares `dev.apotheosis.ApotheosisMod` as the `main`
entrypoint. The class is present, implements `net.fabricmc.api.ModInitializer`,
and defines `onInitialize`. The manifest's `${version}` placeholder was expanded
by Gradle's `processResources` to `1.0.0` (confirmed by reading the jar's copy).

### 3. Every class reference resolves

All `CONSTANT_Class` entries in all 29 class files were extracted and resolved
against the jar contents, the JDK, and the mod's declared dependencies:

| Provider | References |
| --- | --- |
| JDK 17 | 168 |
| Own classes | 116 |
| Minecraft 1.20.1 | 110 |
| Fabric loader + Fabric API | 25 |
| Minecraft (Brigadier) | 7 |
| Fabric loader (SLF4J) | 3 |
| Minecraft (Gson) | 2 |
| **Unresolvable** | **0** |

The only non-class entries the first pass flagged were five array descriptors
(`[Ldev/apotheosis/core/GearKind;`, `[Lnet/minecraft/class_1304;`, …). Arrays are
derived from classes already accounted for, so there are **no missing
libraries**: everything outside the jar is supplied by the JDK, Minecraft, or
Fabric. No shading, no bundled third-party code, no reflection onto optional
classes.

### 4. The shipped bytecode matches the current source

The jar is produced by CI from the branch, and the branch has no source commit
newer than the jar. Two behaviour-critical changes were confirmed inside the
compiled classes rather than assumed:

| Source change | Evidence in `CombatEvents.class` / `EliteManager.class` |
| --- | --- |
| One promotion roll per mob (`apotheosis_checked`) | string constant `apotheosis_checked` present |
| Deferred damage guarded against dead entities | calls `class_1309.method_31481()Z` (intermediary for `Entity#isRemoved`) inside both `lambda$allowDamage$0` and `lambda$allowDamage$1` |
| Combat built on `ALLOW_DAMAGE` | field `ALLOW_DAMAGE` and method `allowDamage` referenced |

(Bedrock-style verification of the other direction — decompiling and diffing —
was not performed; the jar was built from this source by the pipeline, not
assembled by hand.)

### 5. Mixins

There is **no `mixins.json` and no mixin class in the jar**. This is deliberate,
not an omission:

* every hook used is a public Fabric API event (`ServerEntityEvents.ENTITY_LOAD`,
  `ServerLivingEntityEvents.ALLOW_DAMAGE` / `AFTER_DEATH`,
  `UseBlockCallback`, `CommandRegistrationCallback`, `ServerTickEvents`) or a
  vanilla API call (`MobSpawnerBlockEntity` NBT round-trip);
* a mod with zero mixins cannot conflict with another mod's mixins, cannot be
  broken by a mixin refactor of Minecraft, and cannot fail a
  `Mixin apply failed` check at launch.

If you specifically want a `mixins.json` for a future feature, it would be added
as `"mixins": ["apotheosis.mixins.json"]` in `fabric.mod.json` with its own
package — but adding one today would only introduce the risk the brief asks to
avoid.

## Requirements traceability

| Requirement | Implementation | Verified by |
| --- | --- | --- |
| 5 rarities, §7/§9/§a/§5/§6 | `core/Rarity.java` | compiled; colours are string constants in the class |
| `ApotheosisData` NBT payload | `core/AffixData.java` (`ROOT_KEY = "ApotheosisData"`) | string constant present in bytecode |
| Bonus max health / attack damage / movement speed / knockback resistance | `core/StatType`, applied by `system/PlayerAttributeHandler` | attribute calls resolve to `class_6880` / `class_1322` |
| Crit chance, crit damage, lifesteal, thorns, ignite, frost | `core/StatType`, resolved by `system/CombatEvents` | hooks `IFESTEAL`, `IGNITE` etc. present |
| Dynamic name + colour-coded lore | `core/NameLore.java`, affix table in `core/Affixes.java` (`Keen`, `of the Berserker`, 11 more) | 13 affixes counted in source; lore writer uses `display.Lore` |
| `ENTITY_LOAD` promotion at 4 % for zombie/skeleton/wither skeleton/drowned | `system/EliteManager.java` | `ENTITY_LOAD` reference present; eligible set is the four types |
| Glowing, coloured nametag, affixed gear, +200 % HP | `system/EliteManager.java` | `MULTIPLY_TOTAL` modifier with value 2.0 from config |
| Guaranteed Epic/Mythic drop | `system/EliteManager.java` `onDeath` | `AFTER_DEATH` reference present |
| `UseBlockCallback` spawner tuning (Feather fastens delay) | `system/SpawnerTuning.java` | callback reference present; NBT keys are string constants |
| Reforge / upgrade / socket | `system/ReforgingService.java` + `block/ReforgingAltarBlock.java` | compiled |
| Assets (models, textures, lang, blockstate, loot table) | `src/main/resources` | 25 asset + 10 data entries in the jar |
| Automated build script | `fabric/build.sh`, `fabric/build.ps1` | used to produce this jar via CI |

## Not verified (be explicit)

* **No runtime test.** The jar has never been loaded by Minecraft in this
  environment — there is no JVM and no game here. Compilation and linkage are
  proven; gameplay is not.
* **Spawner tuning depends on vanilla re-reading NBT.** If Mojang changes that
  behaviour, the item interaction would do nothing rather than crash.
* **Balance and feel** (drop rates, damage numbers, elite difficulty) are
  untested in play.
* **Client rendering of elite equipment** (armour on drowned / wither skeletons)
  is standard vanilla behaviour but was not observed.

## First-run smoke test

1. Fabric Loader 0.14.22+ for 1.20.1, Fabric API in `mods/`, plus this jar.
2. Launch; expect `Apotheosis initialised: 5 rarities, 13 affixes, 0 mixins`.
3. `/apotheosis help` → the command tree should list five subcommands.
4. `/apotheosis give hammer`, `/apotheosis gear mythic`, hold the item, right-click
   the altar → the name and lore should render with rarity colour.
5. `/apotheosis config promotionchance 1`, then spawn zombies until one is
   promoted; confirm the glowing nametag and the Epic/Mythic drop on death.
