# Tiled semantic prefab contract

Tiled `.tmj` maps are build-time authoring sources. Run
`npm run gen:visual-assets` to validate and compile them into
`src/generated/semantic-prefabs.json`. Runtime code never reads Tiled GIDs.

## Map setup

- Orthogonal, finite map with 32×32 tiles.
- Set map property `darkwar.prefabKey` to a stable dotted key.
- Set `darkwar.transforms` to a comma-separated allowlist chosen from
  `identity`, `rotate90`, `rotate180`, `rotate270`, and `reflectX`.
- Reference a `.tsj` whose tiles carry `darkwar.semanticKey`. The included
  `tilesets/dark-war-semantic-palette.tsj` is the starter palette.

Tile layers named `ground`, `structure`, and `fixture` compile into semantic
layers. Empty cells preserve destination state. Elevation is authored with
rectangle objects of class `elevation` and integer property
`darkwar.elevation`.

## Markers

Point objects in an object layer use one of these classes:

| Class     | Required properties                                          | Purpose                                       |
| --------- | ------------------------------------------------------------ | --------------------------------------------- |
| `socket`  | `darkwar.socket`, `darkwar.direction`                        | Deterministic edge matching.                  |
| `spawn`   | `darkwar.spawn`                                              | Entity, item, or encounter request.           |
| `portal`  | `darkwar.targetSpace`, `darkwar.targetPlane`, `darkwar.kind` | Portal contract emitted to the placer.        |
| `sign`    | `darkwar.sign`                                               | Data-driven readable environmental marker.    |
| `require` | `darkwar.layer`, `darkwar.semanticKey`                       | Precondition checked before any cell changes. |

Transforms rotate marker positions and socket directions. Stamping validates
the whole footprint and requirements before writing, then uses `WorldPlane`
edits so collision and bounded visual neighborhoods repair through the same
path as procedural generation and player terrain editing.

`prefabs/cave-rest-stop.tmj` is the canonical example and is stamped into the
procedurally carved park grotto.
