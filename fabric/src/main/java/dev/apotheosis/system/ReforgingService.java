package dev.apotheosis.system;

import java.util.List;
import java.util.Random;

import dev.apotheosis.core.AffixData;
import dev.apotheosis.core.Affixes;
import dev.apotheosis.core.ItemFactory;
import dev.apotheosis.core.ItemStats;
import dev.apotheosis.core.NameLore;
import dev.apotheosis.core.Rarity;
import dev.apotheosis.core.RolledAffix;
import dev.apotheosis.registry.ModItems;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;

/**
 * The reforging altar's rules: reforge, upgrade, socket, inspect.
 *
 * <p>Presentation lives in the block, rules live here, so the same operations
 * are reachable from the altar and from {@code /apotheosis} commands. Costs are
 * checked before anything is consumed, and a failed mutation never charges the
 * player.</p>
 *
 * <p>Interaction contract: <b>main hand = the item being worked on, off hand =
 * the catalyst</b>. The altar swaps the roles if the catalyst is in the main
 * hand, so either order works.</p>
 */
public final class ReforgingService {

    private ReforgingService() {
    }

    /** Altar interaction. Returns true when the click was consumed. */
    public static boolean interact(PlayerEntity player) {
        if (!(player instanceof ServerPlayerEntity serverPlayer)) {
            return false;
        }
        ItemStack main = player.getMainHandStack();
        ItemStack off = player.getOffHandStack();

        Hand targetHand = isCatalyst(main) && !isCatalyst(off) ? Hand.OFF_HAND : Hand.MAIN_HAND;
        Hand catalystHand = targetHand == Hand.MAIN_HAND ? Hand.OFF_HAND : Hand.MAIN_HAND;
        ItemStack target = player.getStackInHand(targetHand);
        ItemStack catalyst = player.getStackInHand(catalystHand);

        if (target.isEmpty() || isCatalyst(target)) {
            showHelp(serverPlayer);
            return false;
        }

        if (catalyst.isOf(ModItems.CODEX)) {
            inspect(serverPlayer, target);
            return true;
        }
        if (catalyst.isOf(ModItems.REFORGE_HAMMER)) {
            return reforge(serverPlayer, target, targetHand);
        }
        if (catalyst.isOf(ModItems.AFFIX_GEM)) {
            return socket(serverPlayer, target, targetHand, catalyst);
        }
        if (catalyst.isOf(ModItems.ARCANE_DUST)) {
            return upgrade(serverPlayer, target, targetHand);
        }

        showHelp(serverPlayer);
        return false;
    }

    /* ------------------------------------------------------------------ */
    /* Reforge                                                            */
    /* ------------------------------------------------------------------ */

    /** Re-rolls every affix. Unattuned gear is given a fresh rarity instead. */
    public static boolean reforge(ServerPlayerEntity player, ItemStack target, Hand hand) {
        AffixData existing = AffixData.get(target);
        Rarity basis = existing != null ? existing.rarity : Rarity.COMMON;
        int dust = existing != null ? Math.max(1, basis.reforgeDust()) : 1;
        int levels = basis.tier() + 1;

        if (!pay(player, dust, levels)) {
            return false;
        }

        Random random = player.getRandom();
        AffixData data = existing != null ? existing : new AffixData();
        if (existing == null) {
            data.rarity = Rarity.roll(random);
            data.level = 1 + random.nextInt(10);
        } else {
            data.level = Math.min(100, data.level + 1);
        }

        data.affixes.clear();
        data.affixes.addAll(Affixes.roll(data.rarity, ItemFactory.kindOf(target), data.level, random));
        data.save(target);
        NameLore.apply(target, data);
        player.setStackInHand(hand, target);

        if (data.affixes.isEmpty()) {
            message(player, "\u00A7eThe altar hums, but Common gear holds no affixes. Upgrade the rarity first.");
        } else {
            message(player, "\u00A7aReforged \u2192 " + data.rarity.colored(stripBrackets(target))
                    + "\u00A77 (" + data.affixes.size() + " affixes)");
        }
        success(player);
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* Upgrade                                                            */
    /* ------------------------------------------------------------------ */

    /** Raises the item one rarity tier, filling the new affix slot. */
    public static boolean upgrade(ServerPlayerEntity player, ItemStack target, Hand hand) {
        AffixData data = AffixData.get(target);
        if (data == null) {
            message(player, "\u00A7cReforge this item at least once before upgrading its rarity.");
            return false;
        }
        Rarity next = data.rarity.next();
        if (next == null) {
            message(player, "\u00A76This item is already Mythic \u2014 the top of the ladder.");
            return false;
        }
        if (!pay(player, next.upgradeDust(), next.tier())) {
            return false;
        }

        data.rarity = next;
        while (data.affixes.size() < next.affixCount()) {
            RolledAffix rolled = Affixes.rollOne(next, ItemFactory.kindOf(target), data.level,
                    player.getRandom(), Affixes.idsOf(data.affixes));
            if (rolled == null) {
                break;
            }
            data.affixes.add(rolled);
        }
        data.save(target);
        NameLore.apply(target, data);
        player.setStackInHand(hand, target);

        message(player, "\u00A7aUpgraded to " + next.colored(next.displayName()) + "\u00A77 \u2014 "
                + data.affixes.size() + " affix slots");
        success(player);
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* Socket                                                             */
    /* ------------------------------------------------------------------ */

    /** Applies a gem's affix as a permanent bonus on the target. */
    public static boolean socket(ServerPlayerEntity player, ItemStack target, Hand hand, ItemStack gemStack) {
        ItemFactory.GemData gem = ItemFactory.readGem(gemStack);
        if (gem == null) {
            message(player, "\u00A7cThat gem carries no affix.");
            return false;
        }
        AffixData data = AffixData.get(target);
        if (data == null) {
            message(player, "\u00A7cReforge this item first: unattuned gear has no sockets.");
            return false;
        }
        if (data.gems.size() >= data.rarity.socketCapacity()) {
            message(player, "\u00A7cNo free sockets \u2014 " + data.rarity.displayName() + " gear holds "
                    + data.rarity.socketCapacity() + ".");
            return false;
        }
        for (RolledAffix socketed : data.gems) {
            if (socketed.id().equals(gem.affixId())) {
                message(player, "\u00A7cThat affix is already socketed in this item.");
                return false;
            }
        }

        data.gems.add(new RolledAffix(gem.affixId(), gem.value()));
        data.save(target);
        NameLore.apply(target, data);
        player.setStackInHand(hand, target);
        gemStack.decrement(1);

        message(player, "\u00A7aGem socketed \u2014 " + stripBrackets(target) + "\u00A77 now has "
                + data.gems.size() + "/" + data.rarity.socketCapacity() + " gems");
        success(player);
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* Inspect / help                                                     */
    /* ------------------------------------------------------------------ */

    public static void inspect(ServerPlayerEntity player, ItemStack target) {
        AffixData data = AffixData.get(target);
        if (data == null) {
            message(player, "\u00A77" + stripBrackets(target) + "\u00A77 is unattuned \u2014 reforge it to roll affixes.");
            return;
        }
        ItemStats stats = ItemStats.of(target);
        message(player, data.rarity.colored(stripBrackets(target)) + "\u00A77 \u2014 iLvl " + data.level
                + ", " + data.affixes.size() + "/" + data.rarity.affixCount() + " affixes, "
                + data.gems.size() + "/" + data.rarity.socketCapacity() + " gems");
        player.sendMessage(Text.literal(stats.describe().stripTrailing()), false);
    }

    private static void showHelp(ServerPlayerEntity player) {
        message(player, "\u00A77Hold the item in your main hand and a catalyst in your off hand:");
        player.sendMessage(Text.literal("\u00A78 \u2022 \u00A7fHammer\u00A77 \u2014 reforge affixes"), false);
        player.sendMessage(Text.literal("\u00A78 \u2022 \u00A7fArcane Dust\u00A77 \u2014 upgrade rarity"), false);
        player.sendMessage(Text.literal("\u00A78 \u2022 \u00A7fAffix Gem\u00A77 \u2014 socket a bonus"), false);
        player.sendMessage(Text.literal("\u00A78 \u2022 \u00A7fCodex\u00A77 \u2014 inspect the item"), false);
    }

    /* ------------------------------------------------------------------ */
    /* Costs                                                              */
    /* ------------------------------------------------------------------ */

    private static boolean pay(ServerPlayerEntity player, int dust, int levels) {
        if (player.experienceLevel < levels) {
            message(player, "\u00A7cNeeds \u00A7f" + levels + " XP levels\u00A7c (you have " + player.experienceLevel + ").");
            return false;
        }
        if (countDust(player) < dust) {
            message(player, "\u00A7cNeeds \u00A7f" + dust + " Arcane Dust\u00A7c (you have " + countDust(player) + ").");
            return false;
        }
        if (!takeDust(player, dust)) {
            return false;
        }
        if (levels > 0) {
            player.addExperienceLevels(-levels);
        }
        return true;
    }

    private static int countDust(PlayerEntity player) {
        PlayerInventory inventory = player.getInventory();
        int total = 0;
        for (int slot = 0; slot < inventory.size(); slot++) {
            ItemStack stack = inventory.getStack(slot);
            if (stack.isOf(ModItems.ARCANE_DUST)) {
                total += stack.getCount();
            }
        }
        return total;
    }

    private static boolean takeDust(PlayerEntity player, int amount) {
        PlayerInventory inventory = player.getInventory();
        int remaining = amount;
        for (int slot = 0; slot < inventory.size() && remaining > 0; slot++) {
            ItemStack stack = inventory.getStack(slot);
            if (!stack.isOf(ModItems.ARCANE_DUST)) {
                continue;
            }
            int take = Math.min(remaining, stack.getCount());
            stack.decrement(take);
            if (stack.isEmpty()) {
                inventory.removeStack(slot);
            }
            remaining -= take;
        }
        return remaining <= 0;
    }

    /* ------------------------------------------------------------------ */
    /* Feedback                                                           */
    /* ------------------------------------------------------------------ */

    private static boolean isCatalyst(ItemStack stack) {
        return stack.isOf(ModItems.REFORGE_HAMMER)
                || stack.isOf(ModItems.AFFIX_GEM)
                || stack.isOf(ModItems.ARCANE_DUST)
                || stack.isOf(ModItems.CODEX);
    }

    /** Item name without the leading bracket wrapper, for chat messages. */
    private static String stripBrackets(ItemStack stack) {
        return stack.getName().getString();
    }

    private static void success(ServerPlayerEntity player) {
        player.playSound(SoundEvents.BLOCK_ENCHANTMENT_TABLE_USE, 0.8F, 1.15F);
        player.getServerWorld().spawnParticles(ParticleTypes.ENCHANT,
                player.getX(), player.getY() + 1.0, player.getZ(), 24, 0.6, 0.8, 0.6, 0.05);
    }

    private static void message(ServerPlayerEntity player, String text) {
        player.sendMessage(Text.literal("\u00A78[\u00A75Apotheosis\u00A78] \u00A77" + text), false);
    }
}
