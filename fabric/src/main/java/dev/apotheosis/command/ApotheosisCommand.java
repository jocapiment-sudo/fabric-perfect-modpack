package dev.apotheosis.command;

import java.util.Random;

import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.apotheosis.ApotheosisConfig;
import dev.apotheosis.core.AffixDef;
import dev.apotheosis.core.Affixes;
import dev.apotheosis.core.ItemFactory;
import dev.apotheosis.core.Rarity;
import dev.apotheosis.registry.ModItems;
import dev.apotheosis.system.ReforgingService;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.item.ItemStack;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;

/**
 * {@code /apotheosis …} admin commands.
 *
 * <p>Operator-only (permission level 2) because every subcommand hands out
 * items or changes world settings. The commands exist so a server owner can
 * test and seed content without crafting, and so a broken altar interaction can
 * never lock a player out of the mechanics.</p>
 */
public final class ApotheosisCommand {

    private static final Random RANDOM = new Random();

    private ApotheosisCommand() {
    }

    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) ->
                dispatcher.register(CommandManager.literal("apotheosis")
                        .requires(source -> source.hasPermissionLevel(2))
                        .then(CommandManager.literal("help")
                                .executes(context -> help(context.getSource())))
                        .then(CommandManager.literal("give")
                                .then(CommandManager.literal("hammer")
                                        .executes(context -> give(context.getSource(), new ItemStack(ModItems.REFORGE_HAMMER))))
                                .then(CommandManager.literal("codex")
                                        .executes(context -> give(context.getSource(), new ItemStack(ModItems.CODEX))))
                                .then(CommandManager.literal("dust")
                                        .executes(context -> give(context.getSource(), ItemFactory.dust(16))))
                                .then(CommandManager.literal("gem")
                                        .executes(context -> gem(context.getSource(), null))
                                        .then(CommandManager.argument("affix", StringArgumentType.word())
                                                .executes(context -> gem(context.getSource(),
                                                        StringArgumentType.getString(context, "affix"))))))
                        .then(CommandManager.literal("gear")
                                .then(CommandManager.argument("rarity", StringArgumentType.word())
                                        .executes(context -> gear(context.getSource(),
                                                StringArgumentType.getString(context, "rarity")))))
                        .then(CommandManager.literal("reforge")
                                .executes(context -> tool(context.getSource(), "reforge")))
                        .then(CommandManager.literal("upgrade")
                                .executes(context -> tool(context.getSource(), "upgrade")))
                        .then(CommandManager.literal("inspect")
                                .executes(context -> tool(context.getSource(), "inspect")))
                        .then(CommandManager.literal("config")
                                .then(CommandManager.literal("promotionchance")
                                        .then(CommandManager.argument("value", DoubleArgumentType.doubleArg(0.0, 1.0))
                                                .executes(context -> setChance(context.getSource(),
                                                        DoubleArgumentType.getDouble(context, "value")))))
                                .then(CommandManager.literal("healthbonus")
                                        .then(CommandManager.argument("value", DoubleArgumentType.doubleArg(0.0, 20.0))
                                                .executes(context -> setHealthBonus(context.getSource(),
                                                        DoubleArgumentType.getDouble(context, "value"))))))
                ));
    }

    private static int give(ServerCommandSource source, ItemStack stack) throws CommandSyntaxException {
        ServerPlayerEntity player = source.getPlayerOrThrow();
        player.getInventory().offerOrDrop(stack);
        source.sendFeedback(() -> Text.literal("\u00A78[\u00A75Apotheosis\u00A78] \u00A7aGave "
                + stack.getCount() + "x " + stack.getName().getString()), false);
        return 1;
    }

    private static int gem(ServerCommandSource source, String affixId) throws CommandSyntaxException {
        AffixDef def = affixId == null
                ? Affixes.ALL.get(RANDOM.nextInt(Affixes.ALL.size()))
                : Affixes.get(affixId);
        if (def == null) {
            source.sendError(Text.literal("Unknown affix '" + affixId + "'. Try /apotheosis help."));
            return 0;
        }
        return give(source, ItemFactory.gem(def, Rarity.roll(RANDOM, Rarity.UNCOMMON)));
    }

    private static int gear(ServerCommandSource source, String rarityName) throws CommandSyntaxException {
        Rarity rarity = null;
        for (Rarity candidate : Rarity.values()) {
            if (candidate.name().equalsIgnoreCase(rarityName)) {
                rarity = candidate;
                break;
            }
        }
        if (rarity == null) {
            source.sendError(Text.literal("Unknown rarity '" + rarityName + "'. Use common, uncommon, rare, epic or mythic."));
            return 0;
        }
        return give(source, ItemFactory.randomGear(rarity, RANDOM));
    }

    private static int tool(ServerCommandSource source, String action) throws CommandSyntaxException {
        ServerPlayerEntity player = source.getPlayerOrThrow();
        ItemStack held = player.getMainHandStack();
        if (held.isEmpty()) {
            source.sendError(Text.literal("Hold the item you want to work on in your main hand."));
            return 0;
        }
        switch (action) {
            case "reforge" -> ReforgingService.reforge(player, held, Hand.MAIN_HAND);
            case "upgrade" -> ReforgingService.upgrade(player, held, Hand.MAIN_HAND);
            default -> ReforgingService.inspect(player, held);
        }
        return 1;
    }

    private static int setChance(ServerCommandSource source, double value) {
        ApotheosisConfig.promotionChance = value;
        ApotheosisConfig.save();
        source.sendFeedback(() -> Text.literal("\u00A78[\u00A75Apotheosis\u00A78] \u00A7aElite promotion chance is now "
                + Math.round(value * 100.0) + "%"), true);
        return 1;
    }

    private static int setHealthBonus(ServerCommandSource source, double value) {
        ApotheosisConfig.eliteHealthBonus = value;
        ApotheosisConfig.save();
        source.sendFeedback(() -> Text.literal("\u00A78[\u00A75Apotheosis\u00A78] \u00A7aElite health bonus is now +"
                + Math.round(value * 100.0) + "%"), true);
        return 1;
    }

    private static int help(ServerCommandSource source) {
        source.sendFeedback(() -> Text.literal("\u00A75\u00A7lApotheosis \u00A78commands"), false);
        source.sendFeedback(() -> Text.literal("\u00A77/apotheosis give <hammer|codex|dust|gem [affix]>"), false);
        source.sendFeedback(() -> Text.literal("\u00A77/apotheosis gear <common|uncommon|rare|epic|mythic>"), false);
        source.sendFeedback(() -> Text.literal("\u00A77/apotheosis reforge|upgrade|inspect \u00A78(held item)"), false);
        source.sendFeedback(() -> Text.literal("\u00A77/apotheosis config promotionchance <0-1>"), false);
        source.sendFeedback(() -> Text.literal("\u00A77/apotheosis config healthbonus <0-20>"), false);
        source.sendFeedback(() -> Text.literal("\u00A78Affixes: axe = reforge, dust = upgrade, gem = socket, codex = inspect."), false);
        return 1;
    }
}
