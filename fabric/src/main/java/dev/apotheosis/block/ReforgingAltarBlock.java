package dev.apotheosis.block;

import dev.apotheosis.system.ReforgingService;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * The reforging altar.
 *
 * <p>Interaction is deliberately item-driven instead of a custom ScreenHandler:
 * the screen would need a client-side renderer, a texture atlas entry and a
 * sync packet per action, while the item-in-hand model is fully server side and
 * therefore impossible to desync. Main hand holds the item being worked on,
 * off hand holds the catalyst (hammer, gem, dust or codex).</p>
 */
public class ReforgingAltarBlock extends Block {

    public ReforgingAltarBlock(Settings settings) {
        super(settings);
    }

    @Override
    public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, Hand hand, BlockHitResult hit) {
        if (world.isClient()) {
            return ActionResult.SUCCESS;
        }
        // PASS when nothing matched, so the player can still place blocks against the altar.
        return ReforgingService.interact(player) ? ActionResult.SUCCESS : ActionResult.PASS;
    }
}
