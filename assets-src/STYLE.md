# Dark War pixel-production guide

Read [`docs/ART-DIRECTION.md`](../docs/ART-DIRECTION.md) first. That document is
the canonical visual and emotional direction; this file is the compact Aseprite
production checklist.

## Document setup

- Gameplay cell: 32×32 pixels.
- Character footprint: usually 32×32; visible sprite may extend to 32×40–48.
- Color mode: indexed or RGB with the approved palette visible.
- Pixel-perfect tools only; nearest-neighbor scaling; no resampling blur.
- Neutral production light: warm upper left, cool lower-right ambient shadow.

Recommended source layers:

```text
guides          non-exported grid, masks, pivots, footprint
contact-shadow  compact colored grounding shadow
base            silhouette and large local-color clusters
material        secondary planes and texture clusters
light           warm directional highlights and local glow
accent          rare flowers, eyes, sparks, and focal pixels
```

Use tags for animation and slices for footprints, pivots, collision hints, and
export metadata. Keep one asset family per source file as the monolithic legacy
source is retired.

## Drawing order

1. Draw a clean silhouette without a black perimeter.
2. Establish two or three large value masses.
3. Add a compact deep-teal/plum contact or underside cluster.
4. Add material-defining clusters; avoid evenly distributed noise.
5. Add warm top-left light and no more than a few focal highlights.
6. Test at 1× on real neighboring terrain and under FOV dimming.

## Terrain families

- Soft ground: calm base, organic cluster edges, sparse authored accents.
- Water: turquoise body, cool depth, warm/cream glints, readable shoreline.
- Cliffs: authored tops, faces, concave/convex corners, stairs, interruptions,
  vegetation breaks, and bounded colored shadows.
- Structures: warm repaired materials, painted patches, plants, personal detail.
- Ruins: pair every strong decay cue with growth, reuse, repair, or habitation.

## Promotion checklist

- silhouette reads at 1×;
- no universal black outline;
- palette uses a small role-based subset;
- clusters describe form rather than noise;
- footprint and pivot are unambiguous;
- seams and every required mask pass validation;
- animation does not shimmer from uncontrolled single pixels;
- asset feels cheerful, cultivated, playful, or charmingly strange;
- `.aseprite` source and generated runtime output are both committed.

AI-generated images remain references until reconstructed on the grid and pass
this checklist. Preserve generation provenance beside retained concepts.
