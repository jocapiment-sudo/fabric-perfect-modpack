package dev.apotheosis.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * The affix table plus the rolling rules.
 *
 * <p>Design constraints, in order of importance:</p>
 * <ol>
 *   <li>An item never carries the same affix twice (two "Keen"s would read as a
 *       bug, and would let one stat stack without limit).</li>
 *   <li>An item with at least one slot always rolls a prefix, so generated names
 *       never read as "Diamond Sword of the Berserker" without the adjective.</li>
 *   <li>Values scale mildly with item level (max +50 %) so late-game reforges
 *       matter without invalidating the rarity ladder.</li>
 * </ol>
 */
public final class Affixes {

    private Affixes() {
    }

    /** Every affix in the mod. Order here is only the order used in the codex. */
    public static final List<AffixDef> ALL = List.of(
            // ---- weapon prefixes -------------------------------------------------
            new AffixDef("keen", true, "Keen", StatType.CRIT_CHANCE, GearKind.WEAPON,
                    new double[]{0.05, 0.08, 0.12, 0.16, 0.22}),
            new AffixDef("brutal", true, "Brutal", StatType.CRIT_DAMAGE, GearKind.WEAPON,
                    new double[]{0.10, 0.15, 0.22, 0.30, 0.45}),
            new AffixDef("vampiric", true, "Vampiric", StatType.LIFESTEAL, GearKind.WEAPON,
                    new double[]{0.03, 0.05, 0.07, 0.10, 0.14}),
            new AffixDef("blazing", true, "Blazing", StatType.IGNITE_ON_HIT, GearKind.WEAPON,
                    new double[]{2, 3, 4, 5, 7}),
            new AffixDef("frostbound", true, "Frostbound", StatType.FROST_ON_HIT, GearKind.WEAPON,
                    new double[]{1, 2, 3, 4, 6}),

            // ---- armour prefixes -------------------------------------------------
            new AffixDef("spiked", true, "Spiked", StatType.THORNS, GearKind.ARMOR,
                    new double[]{0.05, 0.08, 0.12, 0.18, 0.25}),
            new AffixDef("stalwart", true, "Stalwart", StatType.MAX_HEALTH, GearKind.ARMOR,
                    new double[]{4, 7, 10, 14, 20}),
            new AffixDef("fleet", true, "Fleet", StatType.MOVEMENT_SPEED, GearKind.ARMOR,
                    new double[]{0.03, 0.05, 0.07, 0.09, 0.12}),

            // ---- suffixes --------------------------------------------------------
            new AffixDef("of_the_berserker", false, "of the Berserker", StatType.ATTACK_DAMAGE, GearKind.WEAPON,
                    new double[]{1, 2, 3, 4, 6}),
            new AffixDef("of_the_viper", false, "of the Viper", StatType.CRIT_CHANCE, GearKind.WEAPON,
                    new double[]{0.03, 0.05, 0.08, 0.11, 0.15}),
            new AffixDef("of_the_colossus", false, "of the Colossus", StatType.KNOCKBACK_RESISTANCE, GearKind.ARMOR,
                    new double[]{0.10, 0.15, 0.20, 0.25, 0.35}),
            new AffixDef("of_the_titan", false, "of the Titan", StatType.MAX_HEALTH, GearKind.ANY,
                    new double[]{3, 5, 8, 12, 16}),
            new AffixDef("of_the_zephyr", false, "of the Zephyr", StatType.MOVEMENT_SPEED, GearKind.ANY,
                    new double[]{0.02, 0.03, 0.05, 0.07, 0.10})
    );

    private static final Map<String, AffixDef> BY_ID;

    static {
        Map<String, AffixDef> byId = new HashMap<>();
        for (AffixDef def : ALL) {
            byId.put(def.id(), def);
        }
        BY_ID = Collections.unmodifiableMap(byId);
    }

    public static AffixDef get(String id) {
        return id == null ? null : BY_ID.get(id.toLowerCase(Locale.ROOT));
    }

    public static List<AffixDef> forGear(GearKind kind) {
        List<AffixDef> out = new ArrayList<>();
        for (AffixDef def : ALL) {
            if (def.allows(kind)) {
                out.add(def);
            }
        }
        return out;
    }

    /** Level scaling: +0.5 % potency per item level, capped at +50 %. */
    public static double levelScale(int level) {
        return 1.0 + Math.min(0.5, Math.max(0, level) * 0.005);
    }

    /**
     * Roll a full affix set for a fresh item.
     *
     * @param rarity the rarity whose slot count is honoured
     * @param kind   weapon or armour, filtering the pool
     * @param level  item level, used for potency scaling
     */
    public static List<RolledAffix> roll(Rarity rarity, GearKind kind, int level, Random random) {
        int count = Math.min(rarity.affixCount(), 5);
        if (count <= 0) {
            return List.of();
        }

        List<AffixDef> pool = forGear(kind);
        Collections.shuffle(pool, random);
        List<AffixDef> chosen = new ArrayList<>(pool.subList(0, Math.min(count, pool.size())));

        if (!chosen.isEmpty() && chosen.stream().noneMatch(AffixDef::prefix)) {
            for (AffixDef candidate : pool) {
                if (candidate.prefix() && !chosen.contains(candidate)) {
                    chosen.set(chosen.size() - 1, candidate);
                    break;
                }
            }
        }

        List<RolledAffix> rolled = new ArrayList<>(chosen.size());
        for (AffixDef def : chosen) {
            rolled.add(new RolledAffix(def.id(), value(def, rarity, level, random)));
        }
        return rolled;
    }

    /**
     * Roll a single additional affix, excluding ids the item already has.
     * Returns {@code null} when the pool is exhausted (all affixes present).
     */
    public static RolledAffix rollOne(Rarity rarity, GearKind kind, int level, Random random, Set<String> exclude) {
        List<AffixDef> pool = new ArrayList<>();
        for (AffixDef def : forGear(kind)) {
            if (!exclude.contains(def.id())) {
                pool.add(def);
            }
        }
        if (pool.isEmpty()) {
            return null;
        }
        AffixDef def = pool.get(random.nextInt(pool.size()));
        return new RolledAffix(def.id(), value(def, rarity, level, random));
    }

    /** Ids already present on a set of rolled affixes. */
    public static Set<String> idsOf(List<RolledAffix> rolled) {
        Set<String> ids = new HashSet<>();
        for (RolledAffix affix : rolled) {
            ids.add(affix.id());
        }
        return ids;
    }

    /**
     * Rolled value for one affix. Percentages keep three decimals, seconds one,
     * flat stats are rounded to whole numbers so lore never shows "+3.7 damage".
     */
    private static double value(AffixDef def, Rarity rarity, int level, Random random) {
        // +/- 10 % variance keeps two items of the same rarity from being clones.
        double variance = 0.9 + random.nextDouble() * 0.2;
        double raw = def.value(rarity) * levelScale(level) * variance;
        return switch (def.stat().display()) {
            case PERCENT -> Math.round(raw * 1000.0) / 1000.0;
            case SECONDS -> Math.round(raw * 10.0) / 10.0;
            case FLAT -> Math.max(0, Math.round(raw));
        };
    }
}
