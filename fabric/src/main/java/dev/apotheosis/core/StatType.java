package dev.apotheosis.core;

/**
 * Every stat an affix can grant.
 *
 * <p>The first four ({@link #passive()} == true) are mirrored onto the player's
 * vanilla attributes by {@code PlayerAttributeHandler}; the rest are resolved
 * in {@code CombatEvents} because no attribute can express them.</p>
 */
public enum StatType {
    MAX_HEALTH("max health", Display.FLAT, true),
    ATTACK_DAMAGE("attack damage", Display.FLAT, true),
    MOVEMENT_SPEED("movement speed", Display.PERCENT, true),
    KNOCKBACK_RESISTANCE("knockback resistance", Display.PERCENT, true),

    CRIT_CHANCE("critical strike chance", Display.PERCENT, false),
    CRIT_DAMAGE("critical damage", Display.PERCENT, false),
    LIFESTEAL("lifesteal", Display.PERCENT, false),
    THORNS("thorns", Display.PERCENT, false),
    IGNITE_ON_HIT("ignite on hit", Display.SECONDS, false),
    FROST_ON_HIT("frost on hit", Display.SECONDS, false);

    /** How a value is rendered in item lore. */
    public enum Display {
        FLAT,
        PERCENT,
        SECONDS
    }

    private final String label;
    private final Display display;
    private final boolean passive;

    StatType(String label, Display display, boolean passive) {
        this.label = label;
        this.display = display;
        this.passive = passive;
    }

    public String label() {
        return label;
    }

    public Display display() {
        return display;
    }

    /** True when this stat is applied as a vanilla attribute modifier. */
    public boolean passive() {
        return passive;
    }

    /** Human-readable value, e.g. {@code +12%} or {@code +3}. */
    public String format(double value) {
        return switch (display) {
            case PERCENT -> "+" + Math.round(value * 1000.0) / 10.0 + "%";
            case SECONDS -> "+" + (Math.round(value * 10.0) / 10.0) + "s";
            case FLAT -> "+" + (Math.round(value * 10.0) / 10.0);
        };
    }
}
