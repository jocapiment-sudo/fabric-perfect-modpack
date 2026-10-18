package dev.apotheosis.system;

import dev.apotheosis.ApotheosisConfig;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.block.Blocks;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.block.entity.MobSpawnerBlockEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * Retunes vanilla mob spawners with specific items.
 *
 * <p>No mixin is required: every spawner setting lives in the block entity's
 * NBT ({@code Delay}, {@code MinSpawnDelay}, {@code MaxSpawnDelay},
 * {@code SpawnCount}, {@code MaxNearbyEntities}, {@code SpawnRange}), and the
 * vanilla block entity re-reads those values from NBT. So the mod reads the
 * live compound, edits the keys and writes it straight back — the sort of
 * change a {@code SpawnerBlockEntityMixin} would normally be written for.</p>
 *
 * <table>
 *   <caption>Item to effect</caption>
 *   <tr><td>Feather</td><td>-40 ticks between waves</td></tr>
 *   <tr><td>Gunpowder</td><td>+1 mob per wave</td></tr>
 *   <tr><td>Fermented Spider Eye</td><td>+4 maximum nearby mobs</td></tr>
 *   <tr><td>Sugar</td><td>+1 block spawn radius</td></tr>
 *   <tr><td>Nether Star</td><td>elite surge: every spawn in the zone is promoted</td></tr>
 * </table>
 */
public final class SpawnerTuning {

    private SpawnerTuning() {
    }

    public static void register() {
        UseBlockCallback.EVENT.register(SpawnerTuning::onUseBlock);
    }

    private static ActionResult onUseBlock(PlayerEntity player, World world, Hand hand, BlockHitResult hit) {
        // Only main hand, and only server side, so an interaction cannot run twice.
        if (world.isClient() || hand != Hand.MAIN_HAND) {
            return ActionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        if (!world.getBlockState(pos).isOf(Blocks.SPAWNER)) {
            return ActionResult.PASS;
        }

        BlockEntity blockEntity = world.getBlockEntity(pos);
        if (!(blockEntity instanceof MobSpawnerBlockEntity spawner)) {
            return ActionResult.PASS;
        }

        ItemStack held = player.getStackInHand(hand);
        if (held.isEmpty()) {
            return ActionResult.PASS;
        }

        NbtCompound nbt = spawner.createNbt();
        String message;

        if (held.isOf(Items.FEATHER)) {
            int min = clamp(nbt.getShort("MinSpawnDelay"), 20, 600);
            int max = Math.max(min, clamp(nbt.getShort("MaxSpawnDelay"), 20, 600));
            int delay = clamp(nbt.getShort("Delay"), 0, 600);
            min = Math.max(20, min - 40);
            max = Math.max(min, max - 40);
            nbt.putShort("MinSpawnDelay", (short) min);
            nbt.putShort("MaxSpawnDelay", (short) max);
            nbt.putShort("Delay", (short) Math.min(delay, min));
            message = "Spawn delay is now \u00A7f" + min + "\u00A77-\u00A7f" + max + " ticks";
        } else if (held.isOf(Items.GUNPOWDER)) {
            int count = Math.min(16, clamp(nbt.getShort("SpawnCount"), 1, 16) + 1);
            nbt.putShort("SpawnCount", (short) count);
            message = "Mobs per wave: \u00A7f" + count;
        } else if (held.isOf(Items.FERMENTED_SPIDER_EYE)) {
            int nearby = Math.min(64, clamp(nbt.getShort("MaxNearbyEntities"), 1, 64) + 4);
            nbt.putShort("MaxNearbyEntities", (short) nearby);
            message = "Max nearby mobs: \u00A7f" + nearby;
        } else if (held.isOf(Items.SUGAR)) {
            int range = Math.min(8, clamp(nbt.getShort("SpawnRange"), 1, 8) + 1);
            nbt.putShort("SpawnRange", (short) range);
            message = "Spawn radius: \u00A7f" + range + " blocks";
        } else if (held.isOf(Items.NETHER_STAR)) {
            EliteManager.addAura((ServerWorld) world, pos, ApotheosisConfig.eliteAuraSeconds);
            nbt.putShort("MinSpawnDelay", (short) 20);
            nbt.putShort("MaxSpawnDelay", (short) 60);
            nbt.putShort("Delay", (short) 20);
            message = "Elite surge for \u00A7f" + ApotheosisConfig.eliteAuraSeconds + "s\u00A77 \u2014 spawns here become affix bosses";
        } else {
            return ActionResult.PASS;
        }

        // Write the edited compound back; the vanilla block entity applies it live.
        spawner.readNbt(nbt);
        spawner.markDirty();

        if (!player.isCreative()) {
            held.decrement(1);
        }
        player.playSound(SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, 0.7F, 1.2F);
        player.sendMessage(Text.literal("\u00A78[\u00A7bApotheosis\u00A78] \u00A7a" + message), true);
        return ActionResult.SUCCESS;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
