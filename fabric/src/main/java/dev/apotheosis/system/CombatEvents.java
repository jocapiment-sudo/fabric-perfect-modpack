package dev.apotheosis.system;

import dev.apotheosis.core.ItemStats;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.world.World;

/**
 * Resolves the affixes that no vanilla attribute can express.
 *
 * <p>Everything happens in {@code AFTER_DAMAGE} so the numbers are final: crit
 * and thorns add follow-up damage, lifesteal heals from the damage actually
 * dealt, and ignite/frost apply their status effects. A re-entrancy guard stops
 * our own bonus damage from re-triggering the handler (which would make a crit
 * chain into infinite crits).</p>
 */
public final class CombatEvents {

    private static boolean resolving;

    private CombatEvents() {
    }

    public static void register() {
        ServerLivingEntityEvents.AFTER_DAMAGE.register(CombatEvents::afterDamage);
    }

    private static void afterDamage(LivingEntity entity, DamageSource source, float baseDamage, float damageTaken, boolean blocked) {
        if (resolving || blocked || damageTaken <= 0.0F) {
            return;
        }
        World world = entity.getWorld();
        if (world.isClient()) {
            return;
        }
        Entity attacker = source.getAttacker();

        // ---- offensive procs: the attacker is a player wearing affixed gear ----
        if (attacker instanceof ServerPlayerEntity player && entity != player) {
            ItemStats stats = ItemStats.of(player);

            if (stats.critChance > 0.0 && player.getRandom().nextDouble() < stats.critChance) {
                float bonus = (float) Math.max(1.0, damageTaken * (0.5 + stats.critDamage));
                runGuarded(() -> entity.damage(world.getDamageSources().playerAttack(player), bonus));
            }
            if (stats.lifesteal > 0.0) {
                player.heal((float) (damageTaken * stats.lifesteal));
            }
            if (stats.igniteSeconds > 0.0) {
                entity.setOnFireFor((int) Math.round(stats.igniteSeconds));
            }
            if (stats.frostSeconds > 0.0) {
                entity.addStatusEffect(new StatusEffectInstance(StatusEffects.SLOWNESS,
                        (int) Math.round(stats.frostSeconds * 20.0), 1, false, true, true));
            }
        }

        // ---- defensive proc: thorns reflect onto the melee attacker ----
        if (entity instanceof ServerPlayerEntity victim && attacker instanceof LivingEntity livingAttacker
                && livingAttacker != victim) {
            ItemStats stats = ItemStats.of(victim);
            if (stats.thorns > 0.0) {
                float reflected = (float) Math.max(1.0, damageTaken * stats.thorns);
                runGuarded(() -> livingAttacker.damage(world.getDamageSources().thorns(victim), reflected));
            }
        }
    }

    /** Runs a nested damage call without letting it re-enter this handler. */
    private static void runGuarded(Runnable action) {
        resolving = true;
        try {
            action.run();
        } finally {
            resolving = false;
        }
    }
}
