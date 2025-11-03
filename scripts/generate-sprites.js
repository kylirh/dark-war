/**
 * Generate a simple sprite sheet for Dark War
 * This creates a PNG with ASCII-style sprites that can be loaded by Pixi.js
 */

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const TILE_SIZE = 16;
const SPRITES_PER_ROW = 16;

// Define sprites and their positions
const sprites = {
  // Tiles (row 0)
  wall: { x: 0, y: 0, char: "#", color: "#2b3342" },
  floor: { x: 1, y: 0, char: "·", color: "#2c89c9" },
  doorClosed: { x: 2, y: 0, char: "+", color: "#caa472" },
  doorOpen: { x: 3, y: 0, char: "/", color: "#caa472" },
  doorLocked: { x: 4, y: 0, char: "×", color: "#d08770" },
  stairs: { x: 5, y: 0, char: "<", color: "#7bd88f" },

  // Player (row 1)
  player: { x: 0, y: 1, char: "@", color: "#e6edf3" },

  // Monsters (row 2)
  mutant: { x: 0, y: 2, char: "M", color: "#ff6b6b" },

  // Items (row 3)
  pistol: { x: 0, y: 3, char: "p", color: "#9da5ae" },
  ammo: { x: 1, y: 3, char: "a", color: "#ffd166" },
  medkit: { x: 2, y: 3, char: "+", color: "#7bd88f" },
  keycard: { x: 3, y: 3, char: "k", color: "#5ad1ff" },
};

const canvas = createCanvas(SPRITES_PER_ROW * TILE_SIZE, 4 * TILE_SIZE);
const ctx = canvas.getContext("2d");

// Fill with transparent background
ctx.clearRect(0, 0, canvas.width, canvas.height);

// Set font for rendering characters
ctx.font = "14px monospace";
ctx.textAlign = "center";
ctx.textBaseline = "middle";

// Render each sprite
for (const [name, sprite] of Object.entries(sprites)) {
  const x = sprite.x * TILE_SIZE;
  const y = sprite.y * TILE_SIZE;

  ctx.fillStyle = sprite.color;
  ctx.fillText(sprite.char, x + TILE_SIZE / 2, y + TILE_SIZE / 2);
}

// Save the sprite sheet
const outputPath = path.join(__dirname, "../app/assets/sprites.png");
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync(outputPath, buffer);

console.log(`✓ Generated sprite sheet: ${outputPath}`);
console.log(`  Size: ${canvas.width}x${canvas.height}`);
console.log(`  Sprites: ${Object.keys(sprites).length}`);
