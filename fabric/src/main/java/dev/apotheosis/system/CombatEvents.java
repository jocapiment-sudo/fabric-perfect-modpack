package dev.apotheosis.system;

import dev.apotheosis.core.ItemStats;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.world.World;

/**
 * Resolves the affixes that no vanilla attribute can express.
 *
 * <p>Fabric API 1.20.1 exposes {@code ALLOW_DAMAGE} (pre-mitigation) rather than
 * an "after damage" event, so the design is:</p>
 * <ul>
 *   <li>effects that apply <em>to the victim</em> (ignite, frost) run inline —
 *       they are safe during damage resolution;</li>
 *   <li>damage that would <em>re-enter</em> the damage pipeline (crit bonus,
 *       reflected thorns) is deferred by one server tick via
 *       {@link MinecraftServer#execute}, so it can never recurse into the
 *       calculation that is currently running;</li>
 *   <li>lifesteal heals from the pre-mitigation amount, which keeps it
 *       consistent against armoured targets instead of silently vanishing.</li>
 * </ul>
 */
public final class CombatEvents {

    /** Guards against our own deferred damage re-entering the handler. */
    private static boolean resolving;

    private CombatEvents() {
    }

    public static void register() {
        ServerLivingEntityEvents.ALLOW_DAMAGE.register(CombatEvents::allowDamage);
    }

    private static boolean allowDamage(LivingEntity entity, DamageSource source, float amount) {
        if (resolving || amount <= 0.0F) {
            return true;
        }
        World world = entity.getWorld();
        if (world.isClient()) {
            return true;
        }
        Entity attacker = source.getAttacker();

        // ---- offensive procs: a player with affixed gear hit something ----
        if (attacker instanceof ServerPlayerEntity player && entity != player) {
            ItemStats stats = ItemStats.of(player);

            if (stats.critChance > 0.0 && player.getRandom().nextDouble() < stats.critChance) {
                float bonus = (float) Math.max(1.0, amount * (0.5 + stats.critDamage));
                defer(world, () -> entity.damage(world.getDamageSources().playerAttack(player), bonus));
            }
            if (stats.lifesteal > 0.0) {
                player.heal((float) (amount * stats.lifesteal));
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
                float reflected = (float) Math.max(1.0, amount * stats.thorns);
                defer(world, () -> livingAttacker.damage(world.getDamageSources().thorns(victim), reflected));
            }
        }
        return true;
    }

    /** Runs nested damage one tick later, with the re-entrancy guard held. */
    private static void defer(World world, Runnable action) {
        MinecraftServer server = world.getServer();
        if (server == null) {
            return;
        }
        server.execute(() -> {
            resolving = true;
            try {
                action.run();
            } finally {
                resolving = false;
            }
        });
    }
}
