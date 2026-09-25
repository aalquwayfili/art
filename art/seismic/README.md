# Seismic

[![preview](preview.webp)](https://aalquwayfili.com/art/seismic/)

A thumper truck crosses the desert at dusk and bangs the ground seven times. Each bang is a real wave simulation, and the rock layers underground show up as the echoes are played backward.

[View it live](https://aalquwayfili.com/art/seismic/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **Wave equation on a grid.** The 2D acoustic wave equation is solved with finite differences: an 8th-order (17-point) Laplacian, leapfrog time steps, one GPU thread per cell, on a 2048 × 1024 grid (320 × 160 with `?quality=low`). The source is a Ricker wavelet, and a damping border absorbs waves at the edges ([Cerjan et al. 1985](https://pubs.geoscienceworld.org/seg/geophysics/article-abstract/50/4/705/71992)). The stencil is the one from [Micikevicius 2009](https://developer.download.nvidia.com/CUDA/CUDA_Zone/papers/gpu_3dfd_rev.pdf).
- **The ground.** Four curved layers, a dome, a fault and a slow gas pocket. Migration only gets a blurred copy of this speed map. Each loop of the piece draws new geology.
- **Recording.** The receivers along the surface record the true ground minus the blurred ground, which removes the direct wave. A top mute removes what is left of it.
- **Reverse-time migration.** The receiver recordings are injected back into the grid in reverse order. The source wave is rebuilt backward in time at the same moment: its border scatters waves back in random directions instead of absorbing them ([Clapp 2009](https://doi.org/10.1190/1.3255432)), so no energy is lost and the time step can be run in reverse. Where the wave going down meets the echo coming up, their product adds to the image ([Claerbout 1971](https://sep.stanford.edu/data/media/public/docs/sep73/carlos3/paper_html/node2.html)). The image is then divided by the source illumination and Laplacian-filtered.
- **One fused kernel** does each time step for four wavefields packed in a `vec4`: the true ground, the blurred ground, the source wave and the receiver wave. It also does the recording and the imaging, and it writes the next time level over the previous one, so only two buffers are needed.
- Drawn in chunky blocks, 270 rows tall, with a 4 × 4 ordered dither. The geophones glow with the trace each one is recording.

The method comes from the post [Seeing underground with sound](https://aalquwayfili.com/writing/seismic-imaging-from-zero).

Options: `?quality=low` for a smaller grid. `?t=<seconds>` renders one deterministic frame at that time.
