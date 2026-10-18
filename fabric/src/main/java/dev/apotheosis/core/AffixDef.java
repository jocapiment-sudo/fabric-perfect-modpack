package dev.apotheosis.core;

/**
 * A single affix definition.
 *
 * @param id     stable identifier persisted in NBT — never rename an existing id
 * @param prefix true for adjective prefixes ("Keen"), false for possessive suffixes ("of the Berserker")
 * @param text   the words inserted into the item name
 * @param stat   the stat granted
 * @param gear   the equipment families this affix can roll on
 * @param values potency per rarity tier, index 0 = Common … 4 = Mythic
 */
public record AffixDef(String id, boolean prefix, String text, StatType stat, GearKind gear, double[] values) {

    /** Potency at the given rarity. */
    public double value(Rarity rarity) {
        return values[Math.min(values.length - 1, Math.max(0, rarity.tier()))];
    }

    public boolean allows(GearKind kind) {
        return gear == GearKind.ANY || gear == kind;
    }
}
