# The Shell

[![preview](preview.webp)](https://aalquwayfili.com/art/the-shell/)

Every 24 seconds a huge pale sphere over a dark world sheds its shell of plates and gathers it back, while a low sun circles it.

[View it live](https://aalquwayfili.com/art/the-shell/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **Plates.** 49,152 plates sit on a Fibonacci lattice over the sphere ([González 2010](https://doi.org/10.1007/s11004-009-9257-x)), 8,192 with `?quality=low`. Each is a rough hexagonal tile, 72 vertices, all drawn in one instanced call.
- **Shards.** The shell is split into 13 pieces by nearest site on the sphere (a spherical Voronoi diagram). Plates close to a border, where the nearest and second-nearest sites are almost tied, come loose and tumble on their own. A compute pass, one thread per plate, writes every plate's position and axes each frame, using Rodrigues' rotation formula for the turns.
- **Shadows.** The sun sees the scene through an orthographic shadow map ([Williams 1978](https://doi.org/10.1145/965139.807402)) with 2 × 2 percentage-closer filtering ([Reeves, Salesin and Cook 1987](https://doi.org/10.1145/37402.37435)). The same vertex shaders draw the shadow map and the scene.
- **The world** below is a mesh of ridged fractal noise, shaded with flat facets taken from screen-space derivatives.
- **Pixels.** Everything is drawn into a 288-row target (216 at low), then each pixel gets a 4 × 4 Bayer ordered dither (Bayer 1973) and snaps to the nearest of 14 colours.

Options: `?quality=low` for fewer plates. `?t=<seconds>` renders one deterministic frame at that time.
