package dev.apotheosis.core;

import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;

/**
 * Aggregated affix values for a player (or a single stack).
 *
 * <p>This is recomputed on demand rather than cached: an inventory can change
 * at any time, and the scan is six map lookups per slot. Caching here would be
 * the classic source of "my stats didn't update" bugs.</p>
 */
public final class ItemStats {

    /** Slots that contribute, in the order shown in tooltips. */
    private static final EquipmentSlot[] SLOTS = {
            EquipmentSlot.MAINHAND,
            EquipmentSlot.OFFHAND,
            EquipmentSlot.HEAD,
            EquipmentSlot.CHEST,
            EquipmentSlot.LEGS,
            EquipmentSlot.FEET
    };

    // Passive attributes
    public double maxHealth;
    public double attackDamage;
    public double movementSpeed;
    public double knockbackResistance;

    // Combat procs
    public double critChance;
    public double critDamage;
    public double lifesteal;
    public double thorns;
    public double igniteSeconds;
    public double frostSeconds;

    public static ItemStats of(PlayerEntity player) {
        ItemStats stats = new ItemStats();
        for (EquipmentSlot slot : SLOTS) {
            AffixData data = AffixData.get(player.getEquippedStack(slot));
            if (data != null) {
                stats.add(data);
            }
        }
        return stats.capped();
    }

    public static ItemStats of(ItemStack stack) {
        AffixData data = AffixData.get(stack);
        return data == null ? new ItemStats() : new ItemStats().add(data).capped();
    }

    public ItemStats add(AffixData data) {
        for (RolledAffix rolled : data.all()) {
            add(rolled);
        }
        return this;
    }

    private void add(RolledAffix rolled) {
        AffixDef def = Affixes.get(rolled.id());
        if (def == null) {
            return;
        }
        double value = rolled.value();
        switch (def.stat()) {
            case MAX_HEALTH -> maxHealth += value;
            case ATTACK_DAMAGE -> attackDamage += value;
            case MOVEMENT_SPEED -> movementSpeed += value;
            case KNOCKBACK_RESISTANCE -> knockbackResistance += value;
            case CRIT_CHANCE -> critChance += value;
            case CRIT_DAMAGE -> critDamage += value;
            case LIFESTEAL -> lifesteal += value;
            case THORNS -> thorns += value;
            case IGNITE_ON_HIT -> igniteSeconds += value;
            case FROST_ON_HIT -> frostSeconds += value;
        }
    }

    /** Applies hard caps so a full Mythic set cannot make a player immortal. */
    public ItemStats capped() {
        critChance = Math.min(1.0, critChance);
        lifesteal = Math.min(0.50, lifesteal);
        thorns = Math.min(1.0, thorns);
        knockbackResistance = Math.min(0.90, knockbackResistance);
        movementSpeed = Math.min(0.60, movementSpeed);
        return this;
    }

    public boolean isEmpty() {
        return maxHealth == 0 && attackDamage == 0 && movementSpeed == 0 && knockbackResistance == 0
                && critChance == 0 && critDamage == 0 && lifesteal == 0 && thorns == 0
                && igniteSeconds == 0 && frostSeconds == 0;
    }

    /** Multi-line chat summary used by the altar and the codex. */
    public String describe() {
        if (isEmpty()) {
            return "\u00A78No affix bonuses.";
        }
        StringBuilder out = new StringBuilder();
        append(out, "max health", maxHealth, StatType.Display.FLAT);
        append(out, "attack damage", attackDamage, StatType.Display.FLAT);
        append(out, "movement speed", movementSpeed, StatType.Display.PERCENT);
        append(out, "knockback resistance", knockbackResistance, StatType.Display.PERCENT);
        append(out, "critical chance", critChance, StatType.Display.PERCENT);
        append(out, "critical damage", critDamage, StatType.Display.PERCENT);
        append(out, "lifesteal", lifesteal, StatType.Display.PERCENT);
        append(out, "thorns", thorns, StatType.Display.PERCENT);
        append(out, "ignite", igniteSeconds, StatType.Display.SECONDS);
        append(out, "frost", frostSeconds, StatType.Display.SECONDS);
        return out.toString().stripTrailing();
    }

    private static void append(StringBuilder out, String label, double value, StatType.Display display) {
        if (value <= 0) {
            return;
        }
        String formatted = switch (display) {
            case PERCENT -> "+" + Math.round(value * 1000.0) / 10.0 + "%";
            case SECONDS -> "+" + (Math.round(value * 10.0) / 10.0) + "s";
            case FLAT -> "+" + (Math.round(value * 10.0) / 10.0);
        };
        out.append("\u00A77").append(formatted).append(' ').append(label).append('\n');
    }
}
