package dev.apotheosis;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Plain-JSON configuration at {@code config/apotheosis.json}.
 *
 * <p>Deliberately dependency-free (Gson ships with Minecraft) and intentionally
 * small: anything a player might want to tune per-world is exposed as a
 * command, and only "server operator" knobs live here.</p>
 */
public final class ApotheosisConfig {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("apotheosis.json");

    /** Promote naturally spawned undead into affix bosses. */
    public static boolean naturalElites = true;

    /** Per-spawn promotion chance (0.04 = 4 %, as specified). */
    public static double promotionChance = 0.04;

    /** Extra max health granted to an elite, as a multiplier: 2.0 = +200 %. */
    public static double eliteHealthBonus = 2.0;

    /** How long a Nether Star "elite surge" lasts on a spawner, in seconds. */
    public static int eliteAuraSeconds = 300;

    /** Elites always drop one Epic/Mythic item when true. */
    public static boolean guaranteedEliteDrops = true;

    private ApotheosisConfig() {
    }

    public static void load() {
        try {
            if (Files.exists(FILE)) {
                Data data = GSON.fromJson(Files.readString(FILE), Data.class);
                if (data != null) {
                    naturalElites = data.naturalElites;
                    promotionChance = data.promotionChance;
                    eliteHealthBonus = data.eliteHealthBonus;
                    eliteAuraSeconds = data.eliteAuraSeconds;
                    guaranteedEliteDrops = data.guaranteedEliteDrops;
                }
            } else {
                save();
            }
        } catch (Exception exception) {
            ApotheosisMod.LOGGER.warn("Could not read {}: {}", FILE, exception.toString());
        }
        clamp();
    }

    public static void save() {
        Data data = new Data();
        data.naturalElites = naturalElites;
        data.promotionChance = promotionChance;
        data.eliteHealthBonus = eliteHealthBonus;
        data.eliteAuraSeconds = eliteAuraSeconds;
        data.guaranteedEliteDrops = guaranteedEliteDrops;
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(data));
        } catch (IOException exception) {
            ApotheosisMod.LOGGER.warn("Could not write {}: {}", FILE, exception.toString());
        }
    }

    private static void clamp() {
        promotionChance = Math.max(0.0, Math.min(1.0, promotionChance));
        eliteHealthBonus = Math.max(0.0, Math.min(20.0, eliteHealthBonus));
        eliteAuraSeconds = Math.max(30, Math.min(3600, eliteAuraSeconds));
    }

    /** Serialisation shape — kept separate so the public fields stay simple. */
    private static final class Data {
        private boolean naturalElites = true;
        private double promotionChance = 0.04;
        private double eliteHealthBonus = 2.0;
        private int eliteAuraSeconds = 300;
        private boolean guaranteedEliteDrops = true;
    }
}
