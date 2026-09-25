# Wind on the Hill

[![preview](preview.webp)](https://aalquwayfili.com/art/wind-on-the-hill/)

Gusts run across a million blades of grass on a summer hill, with a lone tree on the crest and big cumulus clouds behind it.

[View it live](https://aalquwayfili.com/art/wind-on-the-hill/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **Grass.** A compute pass grows 1,048,576 blades once (131,072 with `?quality=low`), each with its own height, width, facing, tint and stiffness. They are drawn as instanced triangle strips. Each blade is a quadratic Bézier curve that leans with the wind, in the spirit of [Jahrmann and Wimmer 2017](https://doi.org/10.1145/3023368.3023380).
- **Wind.** Every frame a second compute pass fills a 128 × 128 wind field. Gusts are fractal noise stretched across the wind and carried downwind at 6 m/s, so they arrive as long fronts. Bent blades turn their paler side up, which is how the waves show. The same pass moves the cloud shadows.
- **Clouds.** Each cumulus is a heap of billows in tiers over a flat base. Every billow is a half-sphere, and a soft maximum of their heights blends them into one rounded surface, painted in three tones.
- **The tree** is 67 instanced ellipsoids: a trunk, two limbs and a crown of lumpy leaf clumps that sway with the wind at the crest.
- **Paint.** A four-quadrant Kuwahara filter (Kuwahara et al. 1976, *Processing of RI-angiocardiographic images*) flattens detail into brush-like patches, then paper fibres and grain are laid over it.

Options: `?quality=low` for fewer blades. `?t=<seconds>` renders one deterministic frame at that time.
