# Starlings over Olaya

[![preview](preview.webp)](https://aalquwayfili.com/art/murmuration/)

Maghrib over north Riyadh: 131,072 starlings turn above Kingdom Centre and Al Faisaliah, and every ten seconds a falcon stoops through them.

[View it live](https://aalquwayfili.com/art/murmuration/) · `?quality=low` for phones · `?t=12` renders one deterministic frame at 12 s.

## How it works

- **Boids.** Each bird steers by separation, alignment and cohesion with the birds within its vision radius, after Craig Reynolds, [*Flocks, herds and schools: a distributed behavioral model*](https://doi.org/10.1145/37402.37406), SIGGRAPH 1987. It is also drawn toward one of three points circling the roost, which stretches the flock into a band that turns and folds; it flees the falcon, and prefers level flight.
- **Neighbours through a GPU counting sort.** Space is cut into cells the size of the vision radius, and each cell hashes into a table of buckets. Every step, each bird counts itself into its bucket with `atomicAdd`. A prefix sum turns the counts into slot ranges, and a scatter pass copies each bird into its range. The flock pass then reads only the 27 cells around each bird. This is the scheme in Simon Green, [*Particle Simulation using CUDA*](https://developer.download.nvidia.com/assets/cuda/files/particles.pdf), NVIDIA 2010.
- **Prefix sum.** Each workgroup scans 2048 counts: 8 per thread in registers, then 256 thread totals in shared memory (Hillis and Steele). One more workgroup scans the block totals. See [*Parallel Prefix Sum (Scan) with CUDA*](https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-computing/chapter-39-parallel-prefix-sum-scan-cuda), GPU Gems 3, ch. 39.
- **Deterministic.** Neighbour sums are fixed-point integers, so they don't depend on the order the sort left the birds in, and the same `?t=` always renders the same frame.
- **Picture.** A compute pass projects every bird into a low-resolution grid with atomic adds. The fragment shader draws at that resolution: a cel-shaded sky in flat bands with a 4x4 Bayer dither, a striped sun, clouds lit from below, the flock, and the skyline as 2D shapes. CSS scales the canvas up with hard pixel edges.

| quality | birds | hash buckets | pixels (height) |
| --- | --- | --- | --- |
| default | 131,072 | 262,144 | 450 |
| low | 6,144 | 16,384 | 300 |

The simulation steps 15 times a second; the splat pass moves each bird along its velocity to the display time, so motion stays smooth at any frame rate. A smaller flock keeps the same volume: each bird sees further and carries more ink.
