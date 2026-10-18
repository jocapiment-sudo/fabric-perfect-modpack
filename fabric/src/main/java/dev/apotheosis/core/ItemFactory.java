package dev.apotheosis.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

import dev.apotheosis.registry.ModItems;
import net.minecraft.item.ArmorItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.text.Text;

/**
 * Builds the item stacks the mod hands out: affixed gear, affix gems, dust.
 *
 * <p>All factory methods return fully rendered stacks (payload + name + lore),
 * so callers never have to remember the second step.</p>
 */
public final class ItemFactory {

    public static final String GEM_KEY = "ApotheosisGem";

    /** Gear that can drop from elites or be produced by commands. */
    private static final List<Item> GEAR_POOL = List.of(
            Items.NETHERITE_SWORD, Items.DIAMOND_SWORD, Items.IRON_SWORD,
            Items.DIAMOND_AXE, Items.IRON_AXE,
            Items.DIAMOND_HELMET, Items.DIAMOND_CHESTPLATE, Items.DIAMOND_LEGGINGS, Items.DIAMOND_BOOTS,
            Items.IRON_HELMET, Items.IRON_CHESTPLATE, Items.IRON_LEGGINGS, Items.IRON_BOOTS
    );

    private ItemFactory() {
    }

    /** Armour rolls armour affixes, everything else rolls weapon affixes. */
    public static GearKind kindOf(ItemStack stack) {
        return stack.getItem() instanceof ArmorItem ? GearKind.ARMOR : GearKind.WEAPON;
    }

    /** A specific base item upgraded into an affixed item of the given rarity. */
    public static ItemStack gear(Item item, Rarity rarity, int level, Random random) {
        ItemStack stack = new ItemStack(item);
        AffixData data = new AffixData();
        data.rarity = rarity;
        data.level = level;
        data.affixes.addAll(Affixes.roll(rarity, kindOf(stack), level, random));
        data.save(stack);
        NameLore.apply(stack, data);
        return stack;
    }

    /** A random piece of gear at the given rarity, used by boss drops and commands. */
    public static ItemStack randomGear(Rarity rarity, Random random) {
        Item base = GEAR_POOL.get(random.nextInt(GEAR_POOL.size()));
        int level = 10 + rarity.tier() * 8 + random.nextInt(10);
        return gear(base, rarity, level, random);
    }

    /** An affix gem carrying one specific affix at one specific value. */
    public static ItemStack gem(AffixDef def, Rarity rarity) {
        ItemStack stack = new ItemStack(ModItems.AFFIX_GEM);
        double value = def.value(rarity);

        NbtCompound root = stack.getOrCreateNbt();
        NbtCompound tag = new NbtCompound();
        tag.putString("Affix", def.id());
        tag.putString("Rarity", rarity.name().toLowerCase(Locale.ROOT));
        tag.putDouble("Value", value);
        root.put(GEM_KEY, tag);

        stack.setCustomName(Text.literal(rarity.color() + "Affix Gem"));
        List<String> lore = new ArrayList<>();
        lore.add("\u00A78Socket at a Reforging Altar");
        lore.add("");
        lore.add("\u00A77" + def.stat().format(value) + " " + def.stat().label());
        lore.add(rarity.color() + rarity.displayName() + " \u00A78gem");
        NameLore.setLore(stack, lore);
        return stack;
    }

    /** Reads a gem payload, or {@code null} when the stack is not an affix gem. */
    public static GemData readGem(ItemStack stack) {
        if (stack == null || stack.isEmpty() || !stack.isOf(ModItems.AFFIX_GEM)) {
            return null;
        }
        NbtCompound root = stack.getNbt();
        if (root == null || !root.contains(GEM_KEY, NbtElement.COMPOUND_TYPE)) {
            return null;
        }
        NbtCompound tag = root.getCompound(GEM_KEY);
        AffixDef def = Affixes.get(tag.getString("Affix"));
        if (def == null) {
            return null;
        }
        return new GemData(def.id(), Rarity.byName(tag.getString("Rarity")), tag.getDouble("Value"));
    }

    public static ItemStack dust(int count) {
        return new ItemStack(ModItems.ARCANE_DUST, Math.max(1, count));
    }

    /** A gem payload: which affix, at which rarity, with the value frozen at creation time. */
    public record GemData(String affixId, Rarity rarity, double value) {
    }
}
