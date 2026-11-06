const fs = require("fs");
let content = fs.readFileSync(
  "src/engine/systems/simulation/events.ts",
  "utf8",
);

const regex =
  /  \} else if \(tile === TileType\.DOOR_OPEN\) \{\n    \/\/ Close the door\n    setStateTileAtIndex\(state, i, TileType\.DOOR_CLOSED\);\n    state\.pendingSounds\.push\(\{\n      effect: SoundEffect\.DOOR_CLOSE,\n      worldX: data\.x \* CELL_CONFIG\.w,\n      worldY: data\.y \* CELL_CONFIG\.h,\n    \}\);\n  \}\n\}/;

const replacement = `  } else if (tile === TileType.DOOR_OPEN) {
    // Close the door
    setStateTileAtIndex(state, i, TileType.DOOR_CLOSED);
    state.pendingSounds.push({
      effect: SoundEffect.DOOR_CLOSE,
      worldX: data.x * CELL_CONFIG.w,
      worldY: data.y * CELL_CONFIG.h,
    });
  } else {
    return;
  }

  // Track tile change for physics update
  if (!state.changedTiles) state.changedTiles = new Set();
  state.changedTiles.add(i);
}`;
content = content.replace(regex, replacement);
fs.writeFileSync("src/engine/systems/simulation/events.ts", content);
