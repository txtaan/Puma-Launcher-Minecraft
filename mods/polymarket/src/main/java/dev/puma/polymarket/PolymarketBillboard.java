package dev.puma.polymarket;

import dev.puma.polymarket.block.BillboardBlock;
import dev.puma.polymarket.block.BillboardBlockEntity;
import dev.puma.polymarket.network.Network;
import dev.puma.polymarket.trading.TraderStore;
import dev.puma.polymarket.trading.Trading;
import java.util.Set;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.event.server.ServerStoppingEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Polymarket Billboard: a big screen showing Polymarket's live "Bitcoin Up or Down - 5 minute" market, where players
 * trade the market with gold at the real order-book prices and compete on a leaderboard. Trades and payouts run on the
 * server (trading package); the screen, its chart and the trading window run on the client (client package).
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

        Network.init();
        ServerStartedEvent.BUS.addListener(event -> TraderStore.load(event.getServer()));
        ServerStoppingEvent.BUS.addListener(event -> TraderStore.save());
        TickEvent.ServerTickEvent.Post.BUS.addListener(event -> Trading.tick(event.server()));
        PlayerEvent.PlayerLoggedInEvent.BUS.addListener(event -> {
            if (event.getEntity() instanceof ServerPlayer player) Trading.refresh(player, null);
        });
    }

    private static void addToCreativeTab(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.FUNCTIONAL_BLOCKS) event.accept(BILLBOARD_ITEM);
    }
}
