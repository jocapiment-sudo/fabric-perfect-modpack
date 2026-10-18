package dev.apotheosis;

import dev.apotheosis.command.ApotheosisCommand;
import dev.apotheosis.registry.ModBlocks;
import dev.apotheosis.registry.ModItems;
import dev.apotheosis.system.CombatEvents;
import dev.apotheosis.system.EliteManager;
import dev.apotheosis.system.PlayerAttributeHandler;
import dev.apotheosis.system.SpawnerTuning;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.item.ItemGroups;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Entry point.
 *
 * <p>Registration order matters only in one place: blocks before items, because
 * the altar's {@code BlockItem} needs the block to exist. Everything else is
 * independent event registration, and each system's {@code register()} is
 * idempotent-safe because Fabric invokes the initializer once.</p>
 *
 * <p>This mod ships <b>zero mixins</b>: every hook is a Fabric API event or a
 * vanilla NBT/API call. That is a deliberate compatibility decision — a mod
 * with no mixin classes cannot conflict with, or be broken by, another mod's
 * mixins.</p>
 */
public class ApotheosisMod implements ModInitializer {

    public static final String MOD_ID = "apotheosis";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        ApotheosisConfig.load();

        ModBlocks.register();
        ModItems.register();

        // Surface everything in the creative inventory so it is discoverable.
        ItemGroupEvents.modifyEntriesEvent(ItemGroups.FUNCTIONAL).register(entries -> {
            entries.add(ModItems.REFORGE_HAMMER);
            entries.add(ModBlocks.REFORGING_ALTAR);
            entries.add(ModItems.CODEX);
        });
        ItemGroupEvents.modifyEntriesEvent(ItemGroups.INGREDIENTS).register(entries -> {
            entries.add(ModItems.ARCANE_DUST);
            entries.add(ModItems.AFFIX_GEM);
        });

        PlayerAttributeHandler.register();
        CombatEvents.register();
        EliteManager.register();
        SpawnerTuning.register();
        ApotheosisCommand.register();

        LOGGER.info("Apotheosis initialised: 5 rarities, {} affixes, 0 mixins", 13);
    }
}
