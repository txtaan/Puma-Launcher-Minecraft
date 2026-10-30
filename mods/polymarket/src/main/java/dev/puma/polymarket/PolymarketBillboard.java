package dev.puma.polymarket;

import dev.puma.polymarket.block.BillboardBlock;
import dev.puma.polymarket.block.BillboardBlockEntity;
import java.util.Set;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Polymarket Billboard: a big screen showing Polymarket's live "Bitcoin Up or Down - 5 minute" market, with paper
 * trading at the real order-book prices. The block and its block entity live here; everything that draws or talks to
 * Polymarket runs on the client (see the client and market packages).
 */
@Mod(PolymarketBillboard.MODID)
public final class PolymarketBillboard {
    public static final String MODID = "polymarket_billboard";

    public static final DeferredRegister<Block> BLOCKS = DeferredRegister.create(ForgeRegistries.BLOCKS, MODID);
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MODID);
    public static final DeferredRegister<BlockEntityType<?>> BLOCK_ENTITIES = DeferredRegister.create(ForgeRegistries.BLOCK_ENTITY_TYPES, MODID);

    public static final RegistryObject<Block> BILLBOARD = BLOCKS.register("billboard",
        () -> new BillboardBlock(BlockBehaviour.Properties.of()
            .setId(BLOCKS.key("billboard"))
            .mapColor(MapColor.COLOR_BLACK)
            .strength(1.5F, 6.0F)
            .sound(SoundType.METAL)
            .noOcclusion()
            .lightLevel(state -> 7)
        )
    );
    public static final RegistryObject<Item> BILLBOARD_ITEM = ITEMS.register("billboard",
        () -> new BlockItem(BILLBOARD.get(), new Item.Properties().setId(ITEMS.key("billboard")))
    );
    public static final RegistryObject<BlockEntityType<BillboardBlockEntity>> BILLBOARD_ENTITY = BLOCK_ENTITIES.register("billboard",
        () -> new BlockEntityType<>(BillboardBlockEntity::new, Set.of(BILLBOARD.get()))
    );

    public PolymarketBillboard(FMLJavaModLoadingContext context) {
        var modBus = context.getModBusGroup();
        BLOCKS.register(modBus);
        ITEMS.register(modBus);
        BLOCK_ENTITIES.register(modBus);
        BuildCreativeModeTabContentsEvent.BUS.addListener(PolymarketBillboard::addToCreativeTab);
    }

    private static void addToCreativeTab(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.FUNCTIONAL_BLOCKS) event.accept(BILLBOARD_ITEM);
    }
}
