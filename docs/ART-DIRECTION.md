# Dark War Art Direction

This is the canonical visual and emotional contract for Dark War. Art, UI,
effects, animation, level dressing, and generated concepts must follow it. Read
it before changing visual assets. `docs/TERRAIN-AND-WORLD.md` remains canonical
for world behavior and storage; this document decides how that world feels.

## The promise

**Dark War is a cheerful rebuilding adventure set after the end of the world.**

The setting supplies strange ruins, salvaged technology, odd creatures, and
occasional danger. The player's everyday fantasy is making a place better:
exploring, repairing, planting, building, befriending, and turning discarded
things into a home. Combat creates contrast and excitement, but devastation is
not the game's default emotional register.

The title can remain dramatic. The picture should make the joke: this “dark
war” is full of turquoise ponds, flower-covered ruins, eccentric neighbors,
helpful robots, patched workshops, and new growth.

## Visual pillars

1. **Outline-free modern pixel art.** Separate forms with hue, value, overlap,
   and small contact shadows—not universal black contours.
2. **Cluster first.** Build readable shapes from intentional groups of pixels.
   Texture supports a mass; it never becomes evenly scattered noise.
3. **Light is part of the design.** Warm directional light and cool ambient
   shadow establish mood, depth, and time of day.
4. **Limited but exuberant color.** Use compact material ramps and deep,
   colorful shadows. Reserve the brightest color for focal details.
5. **Playful clarity.** Exaggerated silhouettes and slightly toy-like forms
   should remain legible during movement, FOV dimming, weather, and effects.
6. **Reclaimed, not ruined.** Decay is paired with repair, plants, paint,
   banners, garden beds, jury-rigged utilities, and visible signs of care.

The broad inspiration is the warmth and readability of modern farming and
adventure pixel art, the cinematic colored light of atmospheric pixel scenes,
and the bold cluster work of painterly action games. Named references include
_Stardew Valley_, _Eastward_, _Hyper Light Drifter_, _Moonlighter_, _Owlboy_,
_The Last Night_, and _Fields of Mistria_. They are comparative references, not
templates: do not reproduce their characters, tiles, palettes, or compositions.

## Camera, scale, and shape language

- The gameplay grid remains 32×32 pixels.
- The view is orthographic top-down with a readable three-quarter presentation,
  never an isometric diamond grid.
- Characters generally occupy a 32×32 footprint and may render roughly 32×40
  to 32×48. Heads and hands can be exaggerated for expression.
- Trees, cliffs, buildings, and large props may overhang multiple cells. Their
  grounded footprint and bottom-center anchor must remain unambiguous.
- Prefer rounded crowns, irregular organic edges, chunky steps, soft trapezoids,
  patched panels, and friendly asymmetry over severe boxes and razor edges.
- Silhouettes must work at 1× scale before texture, animation, or lighting is
  added.

## Palette system

Dark War uses a shared set of color roles rather than one enormous global
palette. A biome, season, interior, or time of day may shift the hues while
preserving those roles.

| Role                   | Direction                                                 |
| ---------------------- | --------------------------------------------------------- |
| Deepest separation     | deep teal, navy, or aubergine; almost never neutral black |
| Ambient shadow         | cool blue-green, indigo, or muted plum                    |
| Living ground          | leaf green, spring green, moss, mint                      |
| Water and technology   | turquoise, cyan, sky blue                                 |
| Earth and construction | ochre, warm clay, terracotta, peach                       |
| Energy and attention   | coral, sunny gold, electric mint                          |
| Wonder and strangeness | lavender, violet, pink                                    |
| High light             | warm cream rather than sterile white                      |

Use roughly four to six values per major material family: deepest occlusion,
shadow, local color, light, and an optional focal highlight. Adjacent materials
should not share both value and hue. Hue-shift ramps—cooler shadows and warmer
lights—are preferred to adding gray.

Pure black is reserved for exceptional voids such as an unreadable cave depth,
and even there a deep colored edge should usually mediate the opening. Pure
white is reserved for tiny glints, sparks, and the strongest sunlit accents.

The importable working palette lives at
`assets-src/palettes/dark-war-terrain.gpl`. It is a starting vocabulary, not a
license to use every swatch in every asset.

## Pixel rendering

- Establish the silhouette and two or three large value masses first.
- Add secondary clusters that describe planes, material, and light direction.
- Use isolated pixels sparingly for flowers, sparks, eyes, or specular glints.
- Avoid pillow shading, automatic gradients, indiscriminate dithering, fuzzy
  anti-aliasing, and one-pixel texture sprayed across every surface.
- Do not draw a complete dark perimeter around an object. Use a colored
  underside, contact shadow, or selective dark cluster only where separation is
  needed.
- Favor a few memorable irregularities over uniform procedural wear.
- Inspect at 1×, 2×, and in motion. Nearest-neighbor scaling is mandatory.

## Light and atmosphere

The neutral production setup uses warm light from the upper left and cool
ambient shadow toward the lower right. This is a baseline, not a permanent sun
position; a scene-specific lighting state may replace it consistently.

- Top and upper-left planes receive warm, higher-chroma light.
- Undersides, crevices, and cast shadows shift toward teal, navy, or plum.
- Contact shadows are compact and readable; broad cast shadows may be softer in
  shape but still pixel-clustered.
- Water, glass, metal, and energized technology can carry small high-value
  accents, but highlights must not cover their local color.
- Dappled tree light, warm windows, lantern pools, weather tint, and atmospheric
  distance are encouraged when they do not obscure navigation.
- FOV dimming should preserve hue relationships instead of turning explored
  space monochrome gray.

## Terrain and elevation

- Ground is a calm supporting field with clustered variation, not visual static.
- Soft borders between grass, dirt, sand, and moss should feel organic and
  slightly irregular while remaining resolver-safe.
- Water is bright, inviting, and static in simulation. Animation may suggest
  current, ripples, falls, or reflected light.
- Cliffs are authored hero assets. Warm earthen or cool stone faces use clear
  ledges, colored crevices, small vegetation breaks, and bounded shadows.
- Elevation must read from top shape, vertical face, overlap, and shadow—not from
  black contour bands or explanatory UI.
- Ruins should be softened by moss, flowers, painted repairs, paths, bridges,
  gardens, and reused stone.
- Each biome needs quiet traversal tiles as well as landmark-rich tiles. Do not
  make every cell a focal point.

## Architecture, props, and building

Homes and workshops are the emotional anchors of the game. They should feel
hand-built, adaptable, colorful, and worth improving.

- Use warm materials, patched roofs, painted panels, cloth awnings, rounded
  machinery, plants, lights, signs, and personal clutter.
- Salvage should look ingenious rather than desperate. A mismatched part is an
  opportunity for color and character.
- Construction states should remain satisfying: clear foundations, cheerful
  scaffolds, visible upgrades, and tidy completed silhouettes.
- MegaCorp spaces may begin cooler and more geometric, but habitation introduces
  warm light, improvised color, plants, graffiti, and human-scale additions.
- Weapons and hazards remain readable without dominating peaceful scenes.

## Characters and creatures

- Use compact bodies, expressive heads and hands, readable tools, and distinct
  color blocking.
- Separate faces, hair, clothing, and equipment with hue/value changes instead
  of black outlines.
- Idle, work, friendship, pet, and celebration animations are as important as
  combat animation.
- Friendly robots should be appliance-like, helpful, and expressive. Hostile
  machines can be funny or strange before they are intimidating.
- Mutants and wildlife favor charming oddity, bold shape language, and readable
  behavior over gore or body horror.
- Human designs emphasize builders, scavengers, growers, technicians, cooks,
  travelers, and neighbors. Military language is an accent, not the population's
  default wardrobe.

## Effects and UI

- Effects use bold clusters, short readable timing, and palette-connected light.
- Dust, leaves, petals, repair sparks, planting feedback, construction pops, and
  friendly emotes should make non-combat actions feel excellent.
- Damage effects can be punchy without persistent gore or soot swallowing the
  palette.
- UI should use the same cream, teal, clay, coral, gold, and lavender roles.
  Frames should feel like polished salvaged equipment, not a grim military HUD.
- Status colors must remain accessible and must not rely on hue alone.

## What to avoid

- universal black outlines;
- gray-brown grimdark scenes and permanent nighttime grading;
- realistic gore, suffering as decoration, or oppressive decay without signs of
  agency;
- generic military silhouettes, tactical clutter, and weapon-first compositions;
- noisy grass, rock, or corrosion made from evenly scattered pixels;
- smooth vector curves, blurry scaling, airbrushed gradients, and mixed pixel
  resolutions;
- copying a reference game's character, tile, palette, building, or composition;
- concept art promoted directly into a tilesheet without grid cleanup and seam
  validation.

## Asset workflow

1. Start from a semantic purpose and gameplay footprint.
2. Make a silhouette/value thumbnail on the 32-pixel grid.
3. Select a small role-based ramp from the working palette.
4. Build large clusters, then material clusters, then rare accents.
5. Apply the scene's light direction and colored ambient shadow.
6. Test against neighboring tiles, representative backgrounds, FOV dimming, and
   animation frames.
7. Validate masks, pivots, seams, and resolver metadata.
8. Commit the `.aseprite` source and regenerate runtime outputs.

Aseprite is the preferred hand-authoring source of truth. Reviewed production
pixel boards with recorded prompts and deterministic grid reconstruction are
also permitted when they pass the same native-scale, seam, palette, identity,
and footprint review. Photoshop is suitable for paintovers, concepts, and large
illustrations. Tiled authors terrain metadata and semantic prefabs; it does not
become the runtime world model.

## AI-assisted art

AI is useful for mood exploration, composition, material ideas, variant lists,
and deterministic asset-generator code. It is not a substitute for the final
pixel decisions.

- Give AI the emotional thesis, palette roles, camera, scale, lighting, and
  prohibited traits—not only a list of game names.
- Treat raster output as a concept or paintover source unless it passes the same
  grid, palette, seam, animation, and readability checks as hand-authored art.
- Reconstruct retained work in Aseprite, or generate it explicitly as a
  consistent pixel-art family and rebuild it through the reviewed deterministic
  sampler. Do not downsample arbitrary painterly concept art and call it
  finished pixel art.
- Preserve the prompt and source references beside every retained generated
  concept.
- Never generate production art at runtime.

## Review checklist

An asset is ready when the answer to all applicable questions is yes:

- Does it make the world feel hopeful, playful, cultivated, or intriguingly
  strange rather than generically bleak?
- Is the silhouette readable at 1× scale and without a black outline?
- Are pixels organized into purposeful clusters?
- Is the palette limited, hue-shifted, and consistent with its scene?
- Does light come from a coherent direction with colored shadows?
- Does the gameplay footprint remain obvious despite overhang?
- Does terrain tile, animate, and resolve without visible seams?
- Does it remain legible under FOV, effects, and neighboring materials?
- Is it original rather than a reproduction of an inspiration reference?

## Direction boards

The repo-owned concept boards are visual targets, not tilesheets:

- `assets-src/references/art-direction/environment-concept.png`
- `assets-src/references/art-direction/character-concept.png`

Their prompts and limitations are recorded beside them in
`assets-src/references/art-direction/README.md`.
