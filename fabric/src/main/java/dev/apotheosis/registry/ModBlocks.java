package dev.apotheosis.registry;

import dev.apotheosis.ApotheosisMod;
import dev.apotheosis.block.ReforgingAltarBlock;
import net.fabricmc.fabric.api.item.v1.FabricItemSettings;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.MapColor;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.sound.BlockSoundGroup;
import net.minecraft.util.Identifier;

/** Block (and block item) registration. */
public final class ModBlocks {

    private ModBlocks() {
    }

    public static final Block REFORGING_ALTAR = new ReforgingAltarBlock(
            AbstractBlock.Settings.create()
                    .mapColor(MapColor.PURPLE)
                    .strength(3.5F, 6.0F)
                    .sounds(BlockSoundGroup.STONE)
                    .requiresTool()
                    .luminance(state -> 7)
    );

    public static void register() {
        Identifier id = new Identifier(ApotheosisMod.MOD_ID, "reforging_altar");
        Registry.register(Registries.BLOCK, id, REFORGING_ALTAR);
        Registry.register(Registries.ITEM, id, new BlockItem(REFORGING_ALTAR, new FabricItemSettings()));
    }
}
