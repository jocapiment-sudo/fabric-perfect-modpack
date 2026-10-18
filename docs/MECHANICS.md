# Mechanics reference

This is the behaviour contract of the pack: what each system does, in what order, and with
which numbers. The numbers live in [`src/config.ts`](../src/config.ts) and
[`src/core/rarity.ts`](../src/core/rarity.ts); the tables in
[`docs/AFFIXES.md`](AFFIXES.md) are generated from the same source.

---

## 1. Rarity and affixes

### The ladder

| Rarity | Tier | Affix slots | Name colour | Loot weight |
| --- | --- | --- | --- | --- |
| Common | 0 | 0 | grey | 45 |
| Uncommon | 1 | 1 | green | 28 |
| Rare | 2 | 2 | aqua | 17 |
| Epic | 3 | 3 | light purple (bold) | 8 |
| Mythic | 4 | 4 | gold (bold) | 2 |

Common gear has no affixes; it is what you reforge *from*. Every step up the ladder adds a
slot, raises per-affix potency, and shifts drop weight towards better gear.

### Rolling

`rollAffixes(rarity, slot, itemLevel)`:

1. Rolls `affixSlots` affixes **without replacement** from the pool legal for the slot
   (weapons never roll armour-only affixes, and vice versa).
2. Guarantees at least one prefix, so a name always starts with an adjective.
3. Scales each value by `1 + min(0.5, itemLevel × 0.005)` — at most +50 % at level 100.

Each affix exposes five potency values, one per rarity tier; the table is in
[`docs/AFFIXES.md`](AFFIXES.md).

### Naming and lore

```
Keen Diamond Sword of the Berserker
+10% critical strike chance
+8% lifesteal
Rare • iLvl 24 • 2/3 affix slots
```

The name is `[first prefix] base name [first suffix]` in the rarity colour; the lore lists
every affix with its rolled value. Names are cached in the item payload so they survive a
server restart, and are rebuilt whenever the item is reforged or upgraded.

### Where the data lives

Bedrock has no item NBT and custom item components are not stable at 1.20.80, so each item
carries a JSON payload in a dynamic property (`apoth:item`):

```json
{ "v": 1, "r": "rare", "l": 24, "a": [{ "id": "keen", "v": 0.12 }], "b": [], "n": "Keen Iron Sword" }
```

`v` is the payload version, `r` the rarity, `l` the item level, `a` the rolled affixes, `b`
socketed gems and `n` the cached name. Dynamic properties travel with the item stack, so
chests, shulker boxes, trading and dropping all preserve affixes.

---

## 2. How stats reach the player

Bedrock's stable Script API lets you *read* attributes but not attach modifiers to items. So:

* **Passive stats** are mirrored as hidden vanilla effects by `systems/equipment.ts`. It
  scans all six equipment slots every 10 ticks, aggregates the affixes, and re-applies effects
  every 40 ticks with a 160-tick duration so they never visibly expire. Removing the item
  removes the effect on the next scan.

  | Affix stat | In-game effect |
  | --- | --- |
  | max health | `health_boost` (amplifier scaled by total bonus) |
  | movement speed | `speed` |
  | damage resistance | `resistance` |
  | absorption | `absorption` |
  | fire resistance | `fire_resistance` |
  | water breathing | `water_breathing` |
  | jump boost | `jump_boost` |
  | luck | `luck` |

  Effects are applied with `showParticles: false` and respect the player's existing effect
  levels: the pack only applies an effect when its own amplifier is higher, and only removes
  levels it granted.

* **Event stats** are resolved in `systems/combat.ts` because no effect can express them:

  | Affix | Behaviour |
  | --- | --- |
  | Keen (crit) | chance for bonus burst damage + crit particles |
  | Vampiric (lifesteal) | heal a fraction of damage dealt |
  | Blazing | set the target on fire |
  | Frostbound | apply slowness to the target |
  | Thunderous | bonus "smite" damage with a thunder particle |
  | Hunter | bonus damage against elite-tagged mobs |
  | Bulwark / knockback resistance | chance to cancel incoming knockback |
  | Thorns | reflect damage at melee attackers |
  | Sage | bonus XP on kill |

Bonus damage uses the estimated weapon damage table in `core/gear.ts` rather than a real
player attack attribute, and is deliberately conservative to avoid one-shots.

---

## 3. Affix bosses

| Elite | Base HP | Rarity | Weapon | Armour | Notes |
| --- | --- | --- | --- | --- | --- |
| Zombie Brute | 70 | Uncommon | Iron Sword | Iron | the entry-level boss |
| Husk Juggernaut | 110 | Rare | Iron Axe | Iron | slower, knockback-resistant |
| Skeleton Ranger | 80 | Rare | Iron Sword | Chain | fastest of the five |
| Stray Sorcerer | 140 | Epic | Bloodforged Blade | Diamond | cold-themed |
| Drowned Champion | 200 | Mythic | Dread Cleaver | Netherite | fire immune, largest |

Every elite additionally receives:

* **Rarity buffs** — `health_boost` (tier-scaled), `speed`, `strength`, `resistance`, plus
  `fire_resistance` for fire-immune definitions. Health is topped up again one tick later,
  because the extra hearts from Health Boost only apply on the following tick.
* **Affix gear** — a full armour set and a weapon generated at the elite's rarity
  (`iLvl 18 + 5×tier` for armour, `22 + 5×tier` for the weapon), enchanted, so the gear it
  visibly holds matches the loot table.
* **A decorated name** — `Vorgath the Bloodsworn` in the rarity colour, always visible.
* **Aura + boss bar** — particles twice a second; the nearest elite within 32 blocks draws a
  10-segment health bar into the action bar.
* **Enrage at 35 % health** — speed II and strength II, smoke burst, permanent for that elite.

### Spawning

| Source | Chance / rule |
| --- | --- |
| Natural undead (`zombie`, `husk`, `drowned`, `skeleton`, `stray`) | 4 % by default, only for `Spawned` causes, never babies, capped at 4 live elites per dimension |
| Apotheosis spawner | `eliteChance` per wave (default 10 %) |
| Affix Effigy | always, with luck-weighted rarity |
| `/scriptevent apoth:summon <rarity>` | always, at the requested rarity |

Promotion replaces the vanilla mob so no duplicate is left behind, and tells every player
within 36 blocks that an elite has appeared.

### Drops

Loot is scripted (`dropEliteLoot`) in addition to the entity's vanilla loot table:

| Drop | Chance |
| --- | --- |
| Arcane Dust | always, `3–5 + 2×tier` |
| Affix gem (weapon affix, elite's rarity) | 60 % |
| Rarity orb, one tier below the elite | 40 % |
| Full affix item at the elite's rarity (weapon or armour) | 35 % + 12 % per tier (max 85 %) |

The five elite JSON entities also carry loot tables for vanilla extras (`rotten_flesh`, `bone`,
`prismarine_shard`, …) and a gear table that equips them on spawn.

---

## 4. Spawners

Bedrock cannot read or write the NBT of a vanilla mob spawner, so retuning one in place is
impossible through the stable API. The pack therefore **binds** the spawner:

1. Right-click a `minecraft:mob_spawner` with the **Spawner Tuning Fork**.
2. The block is replaced by `apotheosis:affix_spawner` and a settings record is created.
3. Right-click the new block to edit it; every setting is applied immediately.

Settings (all clamped, see `SPAWNER` in `src/config.ts`):

| Setting | Range | Default |
| --- | --- | --- |
| Mob type | 16 options (undead, illagers, spiders, slimes, blaze, enderman, witch…) | Zombie |
| Delay between waves | 5–180 s | 30 s |
| Mobs per wave | 1–6 | 2 |
| Max nearby mobs | 2–24 | 8 |
| Activation range | 4–32 blocks | 12 |
| Elite chance | 0–100 % | 10 % |
| Particles | on/off | on |

Simulation runs every 20 ticks and only for spawners that:

* still exist as `apotheosis:affix_spawner` (otherwise the record is dropped),
* have at least one player inside the activation range,
* are under the population cap, counted within 16 blocks of the spawner.

Spawn attempts pick a random air block within ±3.5 blocks and require solid ground below, so
mobs never appear floating. Settings are stored in the world dynamic property
`apoth:spawners` through a debounced writer; breaking the block with a player removes its
record.

---

## 5. The Reforging Altar

Craft it, place it, and right-click with the **Reforging Hammer**. The form shows the held
item, its rarity, level and affix count, plus your dust and levels.

| Action | Cost | Effect |
| --- | --- | --- |
| Reforge | rarity reforge cost (dust + levels) | re-rolls every affix on the held item |
| Upgrade | target rarity's dust + levels + **1 orb of the target rarity** | adds a slot and raises rarity |
| Socket gem | 2 dust + 1 level | consumes the gem and binds its affix to a free socket |
| Infuse blank gem | 4 dust + 1 level | turns a blank gem into a gem for an affix you choose |
| Inspect | free | shows computed stats and affix list |
| Salvage | free | destroys the item, returns dust, chance of a gem/orb |

Costs per rarity (dust / levels): Common 1/1 (upgrade 2/1), Uncommon 2/1 (4/1), Rare 4/2 (8/2),
Epic 7/3 (14/3), Mythic 10/4 (no further upgrade). Costs are checked before anything is
consumed, and a failed mutation refunds what was paid.

Socket capacity is `min(5, affixSlots + 1)`, so even a Common item can be given one gem — that
is how a plain diamond sword becomes an affixed one.

---

## 6. Items and recipes

| Item | Recipe (shaped unless noted) |
| --- | --- |
| Reforging Hammer | `III / IAS / ·S·` — iron ingots, amethyst shard, sticks |
| Spawner Tuning Fork | shapeless: 2 iron, 1 amethyst shard, 1 stick |
| Codex of Affixes | shapeless: book + amethyst shard + gold ingot |
| Reforging Altar | `OAO / ADA / OAO` — obsidian, amethyst shards, diamond |
| Arcane Dust ×2 | shapeless: 1 amethyst shard |
| Affix Gem (blank) | shapeless: 2 dust + amethyst shard + glass |
| Affix Effigy | shapeless: amethyst block, bone block, blank gem, 2 gold, 4 dust |
| Uncommon Orb | shapeless: 4 dust + emerald |
| Rare Orb | shapeless: 4 dust + diamond + Uncommon Orb |
| Epic Orb | shapeless: 6 dust + netherite scrap + Rare Orb |
| Mythic Orb | shapeless: 4 dust + nether star + Epic Orb |
| Affix Spawner | shapeless: vanilla mob spawner + 4 dust |

Elite weapons (`boss_blade`, `boss_cleaver`) are drop-only.

---

## 7. Commands and tuning

```
/scriptevent apoth:help
/scriptevent apoth:status
/scriptevent apoth:give <hammer|fork|codex|effigy|dust|orb|gem|gear|blankgem|kit> [args]
/scriptevent apoth:summon <uncommon|rare|epic|mythic>
/scriptevent apoth:config <naturalelites|elitechance|maxelites|spawnerchance|reset> [value]
```

Settings persist in `apoth:settings` and apply to the whole world:

| Key | Default | Meaning |
| --- | --- | --- |
| `naturalelites` | `true` | allow natural undead to become elites |
| `elitechance` | `0.04` | per-spawn promotion chance |
| `maxelites` | `4` | live elites allowed per dimension |
| `spawnerchance` | `0.1` | default elite chance for new spawners |

For deeper rebalancing edit `src/config.ts` (tick rates, spawner limits, particles, sounds) or
`src/core/rarity.ts` (costs, weights, salvage) and rebuild — `npm run validate` will catch
anything that stops resolving.

<a id="bedrock-limits"></a>
## 8. Bedrock limits and how they are handled

| Limitation | Workaround |
| --- | --- |
| No attribute modifiers on items (stable API) | Effect bridge + event hooks, refreshed continuously |
| No item NBT / custom components | `apoth:item` dynamic property per stack |
| No block NBT for spawners | Custom `apotheosis:affix_spawner` block simulated by script |
| `ItemStack` is immutable | Build a new stack and write it back to the slot |
| Read-only `beforeEvents` | All world writes deferred into `system.run` |
| Forms are the only UI | `ActionFormData` for menus/confirmations, `ModalFormData` for sliders/toggles |
| No custom particles | Aura uses only vanilla particle identifiers |
