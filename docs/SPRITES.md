# Sprite System

Dark War now uses **Pixi.js** for hardware-accelerated sprite rendering!

## Architecture

### Renderer (`src/systems/Renderer.ts`)

- Uses Pixi.js Application and Container system
- Sprite sheet-based rendering (32x32 tiles)
- Separate containers for map tiles and entities for proper layering
- Async initialization for loading textures

### Sprite Sheet (`app/assets/sprites.png`)

- 512x128 PNG sprite sheet
- 32x32 pixel tiles organized in rows:
  - **Row 0**: Tiles (wall, floor, doors, stairs)
  - **Row 1**: Player
  - **Row 2**: Monsters (mutant)
  - **Row 3**: Items (pistol, ammo, medkit, keycard)

### Generation Script (`scripts/generate-sprites.js`)

- Generates sprite sheet from ASCII characters
- Uses node-canvas for server-side rendering
- Run with: `npm run sprites`
- Automatically runs before each build

## Adding New Sprites

### 1. Update Sprite Generation Script

Edit `scripts/generate-sprites.js`:

```javascript
const sprites = {
  // Add new sprite
  drone: { x: 1, y: 2, char: "D", color: "#5ad1ff" },
};
```

### 2. Update Sprite Map

Edit `src/systems/Renderer.ts`:

```typescript
const SPRITE_MAP = {
  // Add mapping
  drone: { x: 1, y: 2 },
};
```

### 3. Use in Game Code

Reference the sprite when rendering entities.

## Benefits

✅ **Hardware acceleration** - Uses WebGL for smooth 60fps rendering  
✅ **Scalability** - Easy to swap ASCII sprites for pixel art  
✅ **Performance** - Pixi.js is battle-tested for game rendering  
✅ **Flexibility** - Supports animations, effects, and transformations

## Future Enhancements

- Replace ASCII sprites with pixel art
- Add sprite animations (walking, attacking)
- Particle effects (explosions, muzzle flash)
- Lighting effects and fog
- Sprite tinting for damage indicators
