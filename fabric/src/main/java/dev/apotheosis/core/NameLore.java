package dev.apotheosis.core;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtList;
import net.minecraft.nbt.NbtString;
import net.minecraft.text.Text;

/**
 * Builds the visible identity of an affixed item: its coloured name and its
 * lore breakdown.
 *
 * <p>Lore is written as raw JSON into {@code display.Lore} rather than through
 * a text component helper, because that is the only stable representation in
 * 1.20.1 and it keeps the payload readable in NBT dumps. {@code italic:false}
 * is set explicitly — vanilla renders lore italic by default, which looks wrong
 * for stat lines.</p>
 */
public final class NameLore {

    private NameLore() {
    }

    /** Sets the item name and lore from the payload. */
    public static void apply(ItemStack stack, AffixData data) {
        String base = stack.getItem().getName().getString();

        StringBuilder name = new StringBuilder();
        String prefix = first(data, true);
        if (!prefix.isEmpty()) {
            name.append(prefix).append(' ');
        }
        name.append(base);
        String suffix = first(data, false);
        if (!suffix.isEmpty()) {
            name.append(' ').append(suffix);
        }

        stack.setCustomName(Text.literal(data.rarity.color() + name));
        setLore(stack, loreLines(data));
    }

    /** First prefix/suffix text, or an empty string. */
    private static String first(AffixData data, boolean prefix) {
        for (RolledAffix rolled : data.affixes) {
            AffixDef def = Affixes.get(rolled.id());
            if (def != null && def.prefix() == prefix) {
                return def.text();
            }
        }
        return "";
    }

    /** The lore panel, one line per entry. */
    private static List<String> loreLines(AffixData data) {
        List<String> lines = new ArrayList<>();
        lines.add(data.rarity.color() + data.rarity.displayName() + " \u00A78\u2022 \u00A77iLvl " + data.level);

        if (!data.affixes.isEmpty()) {
            lines.add("");
            for (RolledAffix rolled : data.affixes) {
                AffixDef def = Affixes.get(rolled.id());
                if (def == null) {
                    continue;
                }
                String colour = def.stat().passive() ? "\u00A7a" : "\u00A7c";
                lines.add(colour + def.stat().format(rolled.value()) + " \u00A77" + def.stat().label());
            }
        }

        if (!data.gems.isEmpty()) {
            lines.add("");
            lines.add("\u00A78Socketed gems");
            for (RolledAffix rolled : data.gems) {
                AffixDef def = Affixes.get(rolled.id());
                if (def == null) {
                    continue;
                }
                lines.add("\u00A7d\u25C6 " + def.stat().format(rolled.value()) + " \u00A77" + def.stat().label());
            }
        }

        lines.add("");
        lines.add("\u00A78Reforged at an altar");
        return lines;
    }

    /** Writes lore JSON, replacing any previous lore. Also used for gems/tools. */
    public static void setLore(ItemStack stack, List<String> lines) {
        NbtCompound root = stack.getOrCreateNbt();
        NbtCompound display = root.getCompound("display");
        NbtList lore = new NbtList();
        for (String line : lines) {
            lore.add(NbtString.of("{\"text\":\"" + escape(line) + "\",\"italic\":false}"));
        }
        display.put("Lore", lore);
        root.put("display", display);
    }

    /** Minimal JSON string escaping — the payload only ever contains ASCII and section signs. */
    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
