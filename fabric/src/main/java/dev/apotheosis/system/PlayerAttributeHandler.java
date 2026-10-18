package dev.apotheosis.system;

import java.util.UUID;

import dev.apotheosis.core.ItemStats;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.entity.attribute.EntityAttribute;
import net.minecraft.entity.attribute.EntityAttributeInstance;
import net.minecraft.entity.attribute.EntityAttributeModifier;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * Mirrors passive affix stats onto the player's vanilla attributes.
 *
 * <p>Why not write {@code AttributeModifiers} into the item's NBT? Because
 * vanilla only re-reads item modifiers on inventory sync events, so a reforge
 * would not take effect until the item was moved. Applying modifiers directly
 * to the player and reconciling them once per second is deterministic: the
 * modifier UUID is fixed per attribute, so re-applying is idempotent and can
 * never stack.</p>
 */
public final class PlayerAttributeHandler {

    private static final UUID HEALTH_ID = UUID.fromString("0a1b2c3d-0001-4a1b-9c3d-000000000001");
    private static final UUID DAMAGE_ID = UUID.fromString("0a1b2c3d-0002-4a1b-9c3d-000000000002");
    private static final UUID SPEED_ID = UUID.fromString("0a1b2c3d-0003-4a1b-9c3d-000000000003");
    private static final UUID KNOCKBACK_ID = UUID.fromString("0a1b2c3d-0004-4a1b-9c3d-000000000004");

    private static final int INTERVAL_TICKS = 20;
    private static int ticks;

    private PlayerAttributeHandler() {
    }

    public static void register() {
        ServerTickEvents.END_SERVER_TICK.register(PlayerAttributeHandler::onEndTick);
    }

    private static void onEndTick(MinecraftServer server) {
        if (++ticks % INTERVAL_TICKS != 0) {
            return;
        }
        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            apply(player);
        }
    }

    private static void apply(ServerPlayerEntity player) {
        ItemStats stats = ItemStats.of(player);

        set(player, EntityAttributes.GENERIC_MAX_HEALTH, HEALTH_ID, stats.maxHealth,
                EntityAttributeModifier.Operation.ADDITION);
        set(player, EntityAttributes.GENERIC_ATTACK_DAMAGE, DAMAGE_ID, stats.attackDamage,
                EntityAttributeModifier.Operation.ADDITION);
        set(player, EntityAttributes.GENERIC_MOVEMENT_SPEED, SPEED_ID, stats.movementSpeed,
                EntityAttributeModifier.Operation.MULTIPLY_TOTAL);
        set(player, EntityAttributes.GENERIC_KNOCKBACK_RESISTANCE, KNOCKBACK_ID, stats.knockbackResistance,
                EntityAttributeModifier.Operation.ADDITION);

        // Losing a health bonus can leave current HP above max; clamp it back.
        if (player.getHealth() > player.getMaxHealth()) {
            player.setHealth(player.getMaxHealth());
        }
    }

    private static void set(ServerPlayerEntity player, EntityAttribute attribute, UUID id, double value,
                            EntityAttributeModifier.Operation operation) {
        EntityAttributeInstance instance = player.getAttributeInstance(attribute);
        if (instance == null) {
            return;
        }

        EntityAttributeModifier existing = instance.getModifier(id);
        if (Math.abs(value) < 1.0E-6) {
            if (existing != null) {
                instance.removeModifier(id);
            }
            return;
        }
        if (existing != null) {
            if (Math.abs(existing.getValue() - value) < 1.0E-6 && existing.getOperation() == operation) {
                return; // already correct: avoid pointless attribute recalculation
            }
            instance.removeModifier(id);
        }
        instance.addPersistentModifier(new EntityAttributeModifier(id, "apotheosis.bonus", value, operation));
    }
}
