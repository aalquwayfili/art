# Sandfall

[![preview](preview.webp)](https://aalquwayfili.com/art/sandfall/)

Sand pours at dusk from a crack in a sandstone escarpment. It piles on a ledge, spills onto the mesa and runs over the edge. Each grain's colour depends on when it left the crack, so the piles build up in coloured layers.

[View it live](https://aalquwayfili.com/art/sandfall/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **MLS-MPM** ([Hu et al. 2018](https://doi.org/10.1145/3197517.3201293)): 131,072 particles on a 384 × 216 grid, 8 substeps per frame (24,576 particles on 192 × 108 with `?quality=low`).
- **Two passes per substep.** One particle pass does grid-to-particle and then particle-to-grid. It scatters mass and momentum with `atomicAdd` on fixed-point `i32` values, so the sums are exact and don't depend on thread order. One grid pass turns momentum into velocity, adds gravity and clears the accumulators.
- **Sand plasticity.** Drucker-Prager on the Hencky strain, projected through a closed-form 2 × 2 SVD ([Klár et al. 2016](https://doi.org/10.1145/2897824.2925906)). Volume correction ([Tampubolon et al. 2017](https://doi.org/10.1145/3072959.3073651)) lets sand that spread out in the air pack back into a pile.
- **The rock** is a signed distance field. Grid nodes slide along it with Coulomb friction. Grains that fall off the world come back through the crack, so the sandfall keeps running.
- **Drawing.** Grains are splatted into a canvas at twice the grid resolution. A tent filter smooths it, and the slope of that density lights the sand from the sun. Everything is drawn in 270 rows of blocks with a 4 × 4 ordered dither.

Options: `?quality=low` for fewer grains. `?t=<seconds>` renders one deterministic frame at that time.
