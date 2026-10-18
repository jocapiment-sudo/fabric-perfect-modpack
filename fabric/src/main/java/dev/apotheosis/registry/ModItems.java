package dev.apotheosis.registry;

import dev.apotheosis.ApotheosisMod;
import net.fabricmc.fabric.api.item.v1.FabricItemSettings;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.Identifier;

/** Item registration. Four items, deliberately: every extra registry entry is another asset to keep valid. */
public final class ModItems {

    private ModItems() {
    }

    /** Opens the altar actions; the only tool the mod needs. */
    public static final Item REFORGE_HAMMER = new Item(new FabricItemSettings().maxCount(1).maxDamage(250));

    /** Consumable affix carrier. Non-stackable so each gem keeps its own NBT. */
    public static final Item AFFIX_GEM = new Item(new FabricItemSettings().maxCount(16));

    /** Currency for reforges and upgrades. */
    public static final Item ARCANE_DUST = new Item(new FabricItemSettings());

    /** In-game reference book. */
    public static final Item CODEX = new Item(new FabricItemSettings().maxCount(1));

    public static void register() {
        register("reforge_hammer", REFORGE_HAMMER);
        register("affix_gem", AFFIX_GEM);
        register("arcane_dust", ARCANE_DUST);
        register("codex", CODEX);
    }

    private static void register(String name, Item item) {
        Registry.register(Registries.ITEM, new Identifier(ApotheosisMod.MOD_ID, name), item);
    }
}
