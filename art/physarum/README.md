# Physarum, after the wells

[![preview](preview.webp)](https://aalquwayfili.com/art/physarum/)

A million slime-mould agents leave the cities and oases of a hand-drawn Arabian peninsula and, with no plan, draw the roads between them. Printed as a two-ink risograph.

[View it live](https://aalquwayfili.com/art/physarum/) · `?quality=low` for phones · `?t=12` renders one deterministic frame at 12 s.

## How it works

- **Agents (Jones 2010).** Each agent has a position and heading. Every step it reads the trail at three sensors ahead (left, front, right), turns toward the strongest, moves one cell and deposits. This is the model from Jeff Jones, [*Characteristics of pattern formation and evolution in approximations of Physarum transport networks*](https://doi.org/10.1162/artl.2010.16.2.16202), Artificial Life 16(2), 2010.
- **Deposit with atomics.** Many agents land in the same cell in one step, so deposits go into a `u32` grid with `atomicAdd`. Integer addition doesn't depend on order, so every run is bit-for-bit repeatable.
- **Diffuse and decay.** A second compute pass takes the 3x3 mean of the trail, adds the deposits and the food that each city emits, decays it by 15 % and clears the counters. Two trail buffers ping-pong between steps.
- **Terrain.** A one-off pass bakes the map into the grid: signed distance to the coast, from a hand-drawn polygon plus noise; escarpments (Sarawat, Tuwaiq, Hajar), which the agents avoid climbing; and the sand seas. Sea cells are walls. Feeding cities on a map follows the Tokyo rail experiment in Tero et al., [*Rules for biologically inspired adaptive network design*](https://doi.org/10.1126/science.1177894), Science 327, 2010.
- **Print.** A fragment shader draws two inks on paper. Blue (#0078BF) holds the coast, waterlines, contours, sand stipple and city rings. Fluorescent pink (#FF48B0) holds the trail, solid where it is thick and halftoned where it is thin. The two layers multiply, and the pink drum sits slightly out of register.

| quality | agents | grid |
| --- | --- | --- |
| default | 1,048,576 | 1600 × 900 at 16:9 (900 rows) |
| low | 131,072 | 533 × 300 at 16:9 |

The simulation runs at a fixed 60 steps per second. The map is a sketch, not a survey.
