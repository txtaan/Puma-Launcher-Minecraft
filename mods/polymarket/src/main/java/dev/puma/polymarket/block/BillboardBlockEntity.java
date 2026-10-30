package dev.puma.polymarket.block;

import dev.puma.polymarket.PolymarketBillboard;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

/** Holds no data: it exists so the screen above the post can be drawn by a block entity renderer. */
public class BillboardBlockEntity extends BlockEntity {
    public BillboardBlockEntity(BlockPos pos, BlockState state) {
        super(PolymarketBillboard.BILLBOARD_ENTITY.get(), pos, state);
    }

    /** The screen and leaderboard reach well past the block: keep them visible when only they are in view. */
    @Override
    public AABB getRenderBoundingBox() {
        BlockPos p = getBlockPos();
        return new AABB(p.getX() - 6, p.getY(), p.getZ() - 6, p.getX() + 7, p.getY() + BillboardBlock.SCREEN_TOP + 1, p.getZ() + 7);
    }
}
