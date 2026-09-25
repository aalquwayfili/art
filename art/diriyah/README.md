# Diriyah

[![preview](preview.webp)](https://aalquwayfili.com/art/diriyah/)

A Najdi mud-brick town on a plateau above a palm-lined wadi, as a small voxel diorama. The afternoon turns to sunset and then night: shadows sweep across the rooftops, windows light up one by one, and stars come out.

[View it live](https://aalquwayfili.com/art/diriyah/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- The town is built once by a compute pass into a 128 × 64 × 128 3D texture, about a million voxels. It holds the plateau with its strata, cliffs and scree, the wadi bed with a thin stream and date palms, and a town wall with round watchtowers. The houses are two or three storeys, with stepped triangular merlons, a row of vents under the roof and small windows.
- Each frame a compute pass casts one orthographic ray per output pixel and walks it through the grid cell by cell with a 3D DDA ([Amanatides and Woo 1987](http://www.cse.yorku.ca/~amana/research/grid.pdf)). A second DDA walk toward the sun (or the moon after dusk) gives hard shadows.
- Ambient occlusion comes from the voxels around each face corner, blended across the face (the vertex AO of [0fps 2013](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/)).
- Each window has a random id stored in its voxel, which sets the moment it lights up in the evening and goes dark again before dawn.
- The picture is 320 rows high (180 with `?quality=low`). Every pixel is snapped to a fixed 32-colour palette through a 4 × 4 Bayer ordered dither (Bayer 1973) and scaled up to the screen with hard edges.
- The loop lasts 30 seconds. The camera swings slowly around the diorama, and the sun runs a full circle, going quickly through the morning.

Options: `?quality=low` for fewer pixels. `?t=<seconds>` renders one deterministic frame at that time.
