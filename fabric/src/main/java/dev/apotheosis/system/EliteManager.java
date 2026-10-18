package dev.apotheosis.system;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

import dev.apotheosis.ApotheosisConfig;
import dev.apotheosis.core.ItemFactory;
import dev.apotheosis.core.Rarity;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.EntityAttributeInstance;
import net.minecraft.entity.attribute.EntityAttributeModifier;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.item.Item;
import net.minecraft.item.Items;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * Affix bosses: promotion, buffs, equipment and guaranteed drops.
 *
 * <p>Promotion hooks {@code ENTITY_LOAD}, which fires for every entity added to
 * a world — including mob-spawner output. That means spawners, spawn eggs and
 * natural generation all share one code path, with no mixin into spawning.</p>
 *
 * <p>Elites are identified by a command tag rather than a custom entity type:
 * tags survive save/load, are visible to vanilla commands (and to admins
 * debugging with {@code /data}), and cost nothing to add.</p>
 */
public final class EliteManager {

    public static final String TAG = "apotheosis_elite";
    private static final UUID HEALTH_MODIFIER = UUID.fromString("0a1b2c3d-0005-4a1b-9c3d-000000000005");

    /** 27.7 hours: long enough to read as permanent, short enough to expire cleanly. */
    private static final int GLOW_TICKS = 1_000_000;

    /** Undead that can be promoted, per the brief. */
    private static final Set<EntityType<?>> ELIGIBLE = Set.of(
            EntityType.ZOMBIE,
            EntityType.SKELETON,
            EntityType.WITHER_SKELETON,
            EntityType.DROWNED
    );

    private static final String[] NAMES = {
            "Vorgath the Bloodsworn", "Mordrek the Rotbringer", "Kharzug the Unbroken",
            "Raevan the Deadeye", "Ilyra the Rimebound", "Nauthis the Drowned King",
            "Skarn the Grave-Eater", "Ozrak the Sand Reaver", "Corvin the Hollow"
    };

    /** Temporary "elite surge" zones created by using a Nether Star on a spawner. */
    private static final List<Aura> AURAS = new ArrayList<>();
    private static int ticks;

    private EliteManager() {
    }

    public static void register() {
        ServerEntityEvents.ENTITY_LOAD.register(EliteManager::onLoad);
        ServerLivingEntityEvents.AFTER_DEATH.register(EliteManager::onDeath);
        ServerTickEvents.END_SERVER_TICK.register(EliteManager::onEndTick);
    }

    /* ------------------------------------------------------------------ */
    /* Promotion                                                          */
    /* ------------------------------------------------------------------ */

    private static void onLoad(Entity entity, ServerWorld world) {
        if (!(entity instanceof MobEntity mob) || !ELIGIBLE.contains(mob.getType())) {
            return;
        }
        if (mob.getCommandTags().contains(TAG) || mob.isBaby()) {
            return;
        }

        boolean aura = consumeAura(world, mob.getBlockPos());
        Random random = world.getRandom();
        if (!aura) {
            if (!ApotheosisConfig.naturalElites) {
                return;
            }
            if (random.nextDouble() >= ApotheosisConfig.promotionChance) {
                return;
            }
        }
        promote(mob, Rarity.rollElite(random), random);
    }

    private static void promote(MobEntity mob, Rarity rarity, Random random) {
        mob.addCommandTag(TAG);
        mob.setPersistent();
        mob.setCustomName(Text.literal(rarity.color() + NAMES[random.nextInt(NAMES.length)]));
        mob.setCustomNameVisible(true);
        mob.addStatusEffect(new StatusEffectInstance(StatusEffects.GLOWING, GLOW_TICKS, 0, false, false, false));

        EntityAttributeInstance health = mob.getAttributeInstance(EntityAttributes.GENERIC_MAX_HEALTH);
        if (health != null) {
            // Re-promotion must not stack: the modifier id is fixed.
            health.removeModifier(HEALTH_MODIFIER);
            if (ApotheosisConfig.eliteHealthBonus > 0.0) {
                health.addPersistentModifier(new EntityAttributeModifier(HEALTH_MODIFIER, "apotheosis.elite",
                        ApotheosisConfig.eliteHealthBonus, EntityAttributeModifier.Operation.MULTIPLY_TOTAL));
            }
            mob.setHealth(mob.getMaxHealth());
        }

        equip(mob, rarity, random);
    }

    private static void equip(MobEntity mob, Rarity rarity, Random random) {
        int level = 18 + rarity.tier() * 5;
        mob.equipStack(EquipmentSlot.MAINHAND, ItemFactory.gear(weaponFor(mob.getType()), rarity, level + 4, random));
        mob.setEquipmentDropChance(EquipmentSlot.MAINHAND, 0.0F);

        equipArmour(mob, EquipmentSlot.HEAD, armourFor(rarity, EquipmentSlot.HEAD), rarity, level, random);
        equipArmour(mob, EquipmentSlot.CHEST, armourFor(rarity, EquipmentSlot.CHEST), rarity, level, random);
        equipArmour(mob, EquipmentSlot.LEGS, armourFor(rarity, EquipmentSlot.LEGS), rarity, level, random);
        equipArmour(mob, EquipmentSlot.FEET, armourFor(rarity, EquipmentSlot.FEET), rarity, level, random);
    }

    private static void equipArmour(MobEntity mob, EquipmentSlot slot, Item item, Rarity rarity, int level, Random random) {
        mob.equipStack(slot, ItemFactory.gear(item, rarity, level, random));
        // Armour is part of the boss's identity, not loot: the scripted drop covers rewards.
        mob.setEquipmentDropChance(slot, 0.0F);
    }

    private static Item weaponFor(EntityType<?> type) {
        if (type == EntityType.WITHER_SKELETON) {
            return Items.STONE_SWORD;
        }
        if (type == EntityType.DROWNED) {
            return Items.IRON_SWORD;
        }
        return Items.IRON_SWORD;
    }

    private static Item armourFor(Rarity rarity, EquipmentSlot slot) {
        boolean high = rarity.tier() >= 3;
        boolean mid = rarity.tier() >= 2;
        return switch (slot) {
            case HEAD -> high ? Items.NETHERITE_HELMET : mid ? Items.DIAMOND_HELMET : Items.IRON_HELMET;
            case CHEST -> high ? Items.NETHERITE_CHESTPLATE : mid ? Items.DIAMOND_CHESTPLATE : Items.IRON_CHESTPLATE;
            case LEGS -> high ? Items.NETHERITE_LEGGINGS : mid ? Items.DIAMOND_LEGGINGS : Items.IRON_LEGGINGS;
            case FEET -> high ? Items.NETHERITE_BOOTS : mid ? Items.DIAMOND_BOOTS : Items.IRON_BOOTS;
            default -> Items.IRON_CHESTPLATE;
        };
    }

    /* ------------------------------------------------------------------ */
    /* Drops                                                              */
    /* ------------------------------------------------------------------ */

    private static void onDeath(LivingEntity entity, DamageSource source) {
        if (!(entity instanceof MobEntity mob) || !mob.getCommandTags().contains(TAG)) {
            return;
        }
        World world = mob.getWorld();
        if (world.isClient()) {
            return;
        }
        Random random = world.getRandom();

        boolean hasKiller = source.getAttacker() instanceof ServerPlayerEntity;
        if (ApotheosisConfig.guaranteedEliteDrops || hasKiller) {
            Rarity drop = random.nextFloat() < 0.30F ? Rarity.MYTHIC : Rarity.EPIC;
            mob.dropStack(ItemFactory.randomGear(drop, random));
        }
        mob.dropStack(ItemFactory.dust(2 + random.nextInt(4)));
    }

    /* ------------------------------------------------------------------ */
    /* Spawner elite surges                                               */
    /* ------------------------------------------------------------------ */

    /** Registers an elite surge around a spawner for the configured duration. */
    public static void addAura(ServerWorld world, BlockPos pos, int seconds) {
        AURAS.add(new Aura(world.getRegistryKey(), pos.toImmutable(), world.getTime() + Math.max(1, seconds) * 20L, 32));
    }

    private static boolean consumeAura(ServerWorld world, BlockPos pos) {
        for (Aura aura : AURAS) {
            if (aura.charges <= 0 || !aura.dimension.equals(world.getRegistryKey())) {
                continue;
            }
            if (aura.pos.getSquaredDistance(pos) <= 64.0) {
                aura.charges--;
                return true;
            }
        }
        return false;
    }

    private static void onEndTick(MinecraftServer server) {
        // Expire auras; also refresh glow so a cleared effect does not silently
        // turn a boss back into a normal mob.
        Iterator<Aura> iterator = AURAS.iterator();
        while (iterator.hasNext()) {
            Aura aura = iterator.next();
            ServerWorld auraWorld = server.getWorld(aura.dimension);
            if (aura.charges <= 0 || auraWorld == null || aura.expiresAt < auraWorld.getTime()) {
                iterator.remove();
            }
        }

        if (++ticks % 200 != 0) {
            return;
        }
        for (ServerWorld world : server.getWorlds()) {
            for (Entity entity : world.iterateEntities()) {
                if (entity instanceof MobEntity mob && mob.getCommandTags().contains(TAG)
                        && !mob.hasStatusEffect(StatusEffects.GLOWING)) {
                    mob.addStatusEffect(new StatusEffectInstance(StatusEffects.GLOWING, GLOW_TICKS, 0, false, false, false));
                }
            }
        }
    }

    /** One elite surge zone. Mutable because each promoted mob consumes a charge. */
    private static final class Aura {
        private final net.minecraft.registry.RegistryKey<World> dimension;
        private final BlockPos pos;
        private final long expiresAt;
        private int charges;

        private Aura(net.minecraft.registry.RegistryKey<World> dimension, BlockPos pos, long expiresAt, int charges) {
            this.dimension = dimension;
            this.pos = pos;
            this.expiresAt = expiresAt;
            this.charges = charges;
        }
    }
}
