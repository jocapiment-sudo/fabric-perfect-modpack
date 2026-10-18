# Installing Apotheosis on Bedrock

Tested against **Minecraft Bedrock Edition 1.20.80 and newer** on Windows, Android, iOS and
dedicated servers. The behaviour pack depends on the resource pack, so both must be present.

---

## Requirements

| Requirement | Notes |
| --- | --- |
| Minecraft Bedrock **1.20.80+** | The script modules are pinned to `@minecraft/server` 1.10.0 / `@minecraft/server-ui` 1.1.0, which ship with 1.20.80 |
| Behaviour pack **and** resource pack | The BP declares the RP as a dependency; importing only one produces a "missing dependency" error |
| Scripting enabled | On by default for worlds. No experimental toggle is required for the stable module versions used here |

> **About "Beta APIs"**
> This add-on intentionally targets the *stable* Script API, so the beta toggle is not needed.
> If you change the manifest to a `-beta` module version (for example `1.11.0-beta`), you must
> enable **Settings → Experiments → Beta APIs** on the world, or the scripts will not load.
> On a dedicated server that is `experiments` / `beta_apis` in `server.properties`.

---

## Option A — import the `.mcaddon` (single player, quickest)

1. Build or download `dist/Apotheosis.mcaddon`.
2. Double-click it (Windows/macOS) or share it to Minecraft (mobile). Minecraft opens and
   reports that two packs were imported.
3. Create or edit a world:
   * **Resource Packs → My Packs → Apotheosis — Resources → Activate**
   * **Behaviour Packs → My Packs → Apotheosis — Affixes & Elites → Activate**
4. Accept the prompt about the pack requiring a dependency (it is the resource pack you just
   activated).
5. Enter the world. You should see these lines in the content log (the `§5` is just the
   purple colour code):
   ```
   [Apotheosis] v1.0.0 booting — 5 rarities, 24 affixes, 5 elites.
   [Apotheosis] Ready. Run /scriptevent apoth:help for admin item commands.
   ```

## Option B — import the two `.mcpack` files separately

Same as above, but import `Apotheosis_RP.mcpack` first, then `Apotheosis_BP.mcpack`, and
activate the resource pack **before** the behaviour pack.

## Option C — manual install (dedicated server, version control, development)

Copy the folders into the world's pack directories:

```
<server root>/behavior_packs/apotheosis_bp/
<server root>/resource_packs/apotheosis_rp/
```

Then add them to the world:

```jsonc
// <server root>/worlds/<world name>/world_behavior_packs.json
[
  { "pack_id": "515979af-2fcd-4ef0-8214-1cfbc84452dc", "version": [1, 0, 0] }
]

// <server root>/worlds/<world name>/world_resource_packs.json
[
  { "pack_id": "3c6575b8-522e-43be-85c0-98b99cbca564", "version": [1, 0, 0] }
]
```

The world must be restarted (or reloaded) after the files change. On BDS, `content-log-file`
in `server.properties` is the fastest way to watch for script errors.

---

## Enabling scripting

Bedrock worlds run script packs automatically when the pack is active. There is nothing to
enable for stable module versions. If scripts are not running, check in this order:

1. **Is the behaviour pack active?** A resource pack alone cannot run scripts.
2. **Is the world's engine new enough?** `min_engine_version` is `1.20.80`; older clients will
   refuse to load the pack.
3. **Content log.** Settings → Creator → **Content Log GUI** on, and set the log level to
   *Verbose* to see the `[Apotheosis]` banner and any stack traces.
4. **Beta APIs.** Only needed when module versions in the manifest end in `-beta`.

---

## Verifying the install

With cheats enabled, run:

```
/scriptevent apoth:status
```

Expected output:

```
[Apotheosis] Status
Elites nearby (dimension): 0
Spawners configured: 0
Mobs available: 16
Natural elites: true (4%)
```

(The numbers reflect your world: the elite count is per dimension, and `Spawners configured`
counts every bound spawner in every dimension.)

Then grab a starter kit and try the loop:

```
/scriptevent apoth:give kit
```

1. Place the **Reforging Altar** and right-click it with the **Reforging Hammer**.
2. Right-click a vanilla mob spawner with the **Spawner Tuning Fork** and confirm the bind.
3. Right-click with the **Codex of Affixes** to read the in-game handbook.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "This pack requires a dependency that is not installed" | The resource pack is missing or not activated. Activate it first. |
| Items show as `apotheosis:reforging_hammer` with a purple/black checkerboard | The resource pack is missing or not active. |
| Nothing happens when using the hammer on the altar | Scripts are not running (see the content log), or the block is not an Apotheosis altar. |
| `[Scripting] Module @minecraft/server version 1.10.0 not found` | The game is older than 1.20.80. Update the client/server. |
| Forms never open, "UserBusy" warnings | Another form is already open (possibly from another add-on). The pack retries for a few seconds; close the other screen. |
| Spawner keeps spawning after being broken | Break it with a player (not by explosion) so the cleanup event fires, or restart the world to resync. |
| Elites never spawn naturally | `naturalElites` may be off or the per-dimension cap reached: `/scriptevent apoth:config naturalelites true`. |

### Uninstalling

Deactivate/remove both packs. Items already in the world keep their dynamic properties but
lose their behaviour (they become ordinary items); spawners converted to
`apotheosis:affix_spawner` should be broken before removing the pack, because the block
definition disappears with it.
