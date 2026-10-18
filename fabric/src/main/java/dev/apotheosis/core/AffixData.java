package dev.apotheosis.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtList;

/**
 * The NBT payload attached to an affixed item.
 *
 * <p>Everything about an item's affix state lives in a single compound named
 * {@code ApotheosisData}, which travels with the {@link ItemStack}: dropping,
 * trading, storing in a chest or restarting the server all preserve it. The
 * payload is versioned so a future change can migrate instead of corrupting
 * existing gear.</p>
 *
 * <pre>{@code
 * { ApotheosisData: { Version: 1, Rarity: "rare", Level: 24,
 *                     Affixes: [ { Id: "keen", Value: 0.12d } ],
 *                     Gems:    [ { Id: "vampiric", Value: 0.05d } ] } }
 * }</pre>
 */
public final class AffixData {

    public static final String ROOT_KEY = "ApotheosisData";
    public static final int VERSION = 1;

    public Rarity rarity = Rarity.COMMON;
    public int level = 1;
    public final List<RolledAffix> affixes = new ArrayList<>();
    public final List<RolledAffix> gems = new ArrayList<>();

    /** The affixes plus the socketed gems, which behave identically once applied. */
    public List<RolledAffix> all() {
        List<RolledAffix> out = new ArrayList<>(affixes.size() + gems.size());
        out.addAll(affixes);
        out.addAll(gems);
        return out;
    }

    /** True when this payload has no affix and therefore nothing worth showing. */
    public boolean isEmpty() {
        return affixes.isEmpty() && gems.isEmpty();
    }

    /** Reads the payload, or returns {@code null} for an unattuned item. */
    public static AffixData get(ItemStack stack) {
        if (stack == null || stack.isEmpty()) {
            return null;
        }
        NbtCompound root = stack.getNbt();
        if (root == null || !root.contains(ROOT_KEY, NbtElement.COMPOUND_TYPE)) {
            return null;
        }
        NbtCompound tag = root.getCompound(ROOT_KEY);

        AffixData data = new AffixData();
        data.rarity = Rarity.byName(tag.getString("Rarity"));
        data.level = Math.max(1, tag.getInt("Level"));
        readList(tag, "Affixes", data.affixes);
        readList(tag, "Gems", data.gems);
        return data;
    }

    /** Reads the payload, creating an empty one when the item is unattuned. */
    public static AffixData getOrCreate(ItemStack stack) {
        AffixData existing = get(stack);
        return existing != null ? existing : new AffixData();
    }

    /** Writes the payload back onto the stack and refreshes display name/lore. */
    public void save(ItemStack stack) {
        NbtCompound root = stack.getOrCreateNbt();
        NbtCompound tag = new NbtCompound();
        tag.putInt("Version", VERSION);
        tag.putString("Rarity", rarity.name().toLowerCase(Locale.ROOT));
        tag.putInt("Level", level);
        tag.put("Affixes", writeList(affixes));
        tag.put("Gems", writeList(gems));
        root.put(ROOT_KEY, tag);
    }

    private static void readList(NbtCompound parent, String key, List<RolledAffix> target) {
        NbtList list = parent.getList(key, NbtElement.COMPOUND_TYPE);
        for (int i = 0; i < list.size(); i++) {
            NbtCompound entry = list.getCompound(i);
            String id = entry.getString("Id");
            if (Affixes.get(id) == null) {
                continue; // unknown id: an older/removed affix, drop it quietly
            }
            target.add(new RolledAffix(id, entry.getDouble("Value")));
        }
    }

    private static NbtList writeList(List<RolledAffix> source) {
        NbtList list = new NbtList();
        for (RolledAffix affix : source) {
            NbtCompound entry = new NbtCompound();
            entry.putString("Id", affix.id());
            entry.putDouble("Value", affix.value());
            list.add(entry);
        }
        return list;
    }
}
