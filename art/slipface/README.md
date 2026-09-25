# Slipface

[![preview](preview.webp)](https://github.com/aalquwayfili/art/tree/main/art/slipface)

The lee face of a dune, grain by grain. Most of 48,000 grains of sand start on the slope below the crest, the rest blowing over it; the heap near the brink is too steep to hold, and the face slides. Grains that come to rest out on the flat are blown back over the crest.

A work in progress: the simulation behaves like sand, but at this many grains each one is drawn about 9 mm across, so it reads as a pile of beads more than a dune. Drawing the sand as a surface instead of one sphere per grain is the next step.

Open `index.html` from a local server (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **The sand** is a continuum simulated with MLS-MPM ([Hu et al. 2018](https://doi.org/10.1145/3197517.3201293)) on a 96 × 48 × 40 grid, 32 steps a frame, all in compute shaders. Each step scatters every grain's mass and momentum to its 27 grid nodes with fixed-point atomics, so a run gives the same result every time; updates the grid; and gathers velocities back to the grains.
- **Sand, not jelly.** Each grain carries its deformation. After every step it is split with a 3 × 3 SVD (Jacobi rotations in the shader) and projected back onto the Drucker-Prager cone for a friction angle of 30°, the return mapping of [Klár et al. 2016](https://doi.org/10.1145/2897824.2925906). Pulled apart, sand forgets its shape; sheared past the cone, it slides.
- **The dune** under the moving sand is a height field: an 11° windward slope and a 32° slipface. Grains on it feel Coulomb friction. The dune repeats along its crest, so the simulation wraps there and the drawing repeats it five times.
- **Drawing.** Every grain is a small sphere on a camera-facing square, with its true depth written so grains overlap correctly. A 2048² shadow map from a low sun lets grains shade each other; wind ripples on the gentle slopes are a bent normal.

Options: `?t=<seconds>` simulates from the start and draws that frame. `?record` lets a script step frames one at a time.
