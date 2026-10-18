package dev.apotheosis.core;

/**
 * A concrete affix on a concrete item: the definition id plus the rolled value.
 *
 * <p>Values are stored rather than recomputed so a rebalance of the affix table
 * cannot retroactively buff or nerf gear that already exists in a world.</p>
 */
public record RolledAffix(String id, double value) {
}
