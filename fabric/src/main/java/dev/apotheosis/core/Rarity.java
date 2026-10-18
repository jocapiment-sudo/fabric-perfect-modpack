package dev.apotheosis.core;

import java.util.Locale;
import java.util.Random;

/**
 * The five rarity tiers, in ascending order.
 *
 * <p>Colours follow the classic RPG convention requested for this port:
 * Common grey, Uncommon blue, Rare green, Epic purple, Mythic gold. Each tier
 * owns three balance levers: how many affixes an item can roll, how much dust a
 * reforge costs, and how many dust + orb steps the next upgrade requires.</p>
 *
 * <p>Keeping this as an enum (rather than a data file) means the ladder is
 * exhaustively checked by the compiler: {@link #next()} cannot silently skip a
 * tier, and every switch over rarity must handle all five cases.</p>
 */
public enum Rarity {
    COMMON("Common", "7", 0, 45, 0, 1, 2),
    UNCOMMON("Uncommon", "9", 1, 28, 1, 2, 4),
    RARE("Rare", "a", 2, 17, 2, 4, 8),
    EPIC("Epic", "5", 3, 8, 3, 7, 14),
    MYTHIC("Mythic", "6", 4, 2, 4, 10, 0);

    private final String displayName;
    private final String colorCode;
    private final int tier;
    private final int weight;
    private final int affixCount;
    private final int reforgeDust;
    private final int upgradeDust;

    Rarity(String displayName, String colorCode, int tier, int weight,
           int affixCount, int reforgeDust, int upgradeDust) {
        this.displayName = displayName;
        this.colorCode = colorCode;
        this.tier = tier;
        this.weight = weight;
        this.affixCount = affixCount;
        this.reforgeDust = reforgeDust;
        this.upgradeDust = upgradeDust;
    }

    public String displayName() {
        return displayName;
    }

    /** Section-sign colour prefix, e.g. {@code \u00A7a}. Built from a code so the source stays ASCII. */
    public String color() {
        return "\u00A7" + colorCode;
    }

    public String colored(String text) {
        return color() + text;
    }

    public int tier() {
        return tier;
    }

    public int weight() {
        return weight;
    }

    /** Number of affix slots granted at this rarity (0 for Common). */
    public int affixCount() {
        return affixCount;
    }

    public int reforgeDust() {
        return reforgeDust;
    }

    /** Dust required to upgrade <em>to</em> this rarity; 0 for Common (unreachable). */
    public int upgradeDust() {
        return upgradeDust;
    }

    /** Gems a fully upgraded item may hold: one more than its affix slots, capped at five. */
    public int socketCapacity() {
        return Math.min(5, affixCount + 1);
    }

    /** The next tier, or {@code null} at Mythic. */
    public Rarity next() {
        int next = ordinal() + 1;
        return next < values().length ? values()[next] : null;
    }

    public boolean atLeast(Rarity other) {
        return tier >= other.tier;
    }

    /** Case-insensitive lookup used when reading persisted NBT. Never returns null. */
    public static Rarity byName(String name) {
        if (name == null) {
            return COMMON;
        }
        String normalized = name.trim().toUpperCase(Locale.ROOT);
        for (Rarity rarity : values()) {
            if (rarity.name().equals(normalized)) {
                return rarity;
            }
        }
        return COMMON;
    }

    /** Weighted roll across every tier, used for random drops. */
    public static Rarity roll(Random random) {
        return roll(random, COMMON);
    }

    /** Weighted roll restricted to tiers at or above {@code minimum}. */
    public static Rarity roll(Random random, Rarity minimum) {
        int total = 0;
        for (Rarity rarity : values()) {
            if (rarity.atLeast(minimum)) {
                total += rarity.weight;
            }
        }
        int pick = random.nextInt(Math.max(1, total));
        for (Rarity rarity : values()) {
            if (!rarity.atLeast(minimum)) {
                continue;
            }
            pick -= rarity.weight;
            if (pick < 0) {
                return rarity;
            }
        }
        return minimum;
    }

    /** Elites never drop junk: the floor is Uncommon. */
    public static Rarity rollElite(Random random) {
        return roll(random, UNCOMMON);
    }
}
