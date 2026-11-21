/** Exercise real Pixi pooled objects without allocating a GPU renderer. */
import { describe, expect, it } from "vitest";
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { Renderer } from "./renderer";

interface PoolHarness {
  spritePool: Sprite[];
  graphicsPool: Graphics[];
  destroyFrameChildren(container: Container): void;
  acquireSprite(texture: Texture): Sprite;
  acquireGraphics(): Graphics;
}

describe("renderer display-object recycling", () => {
  it("clears prior-frame sprite transforms and appearance before reuse", () => {
    const renderer = Object.create(Renderer.prototype) as PoolHarness;
    renderer.spritePool = [];
    renderer.graphicsPool = [];
    const container = new Container();
    const sprite = new Sprite(Texture.EMPTY);
    sprite.scale.set(2, 3);
    sprite.anchor.set(0.5, 1);
    sprite.rotation = 1;
    sprite.alpha = 0.2;
    sprite.tint = 0x123456;
    sprite.zIndex = 50;
    container.addChild(sprite);
    renderer.destroyFrameChildren(container);
    expect(container.children).toHaveLength(0);
    const reused = renderer.acquireSprite(Texture.EMPTY);
    expect(reused).toBe(sprite);
    expect([
      reused.scale.x,
      reused.scale.y,
      reused.anchor.x,
      reused.anchor.y,
      reused.rotation,
      reused.alpha,
      reused.tint,
      reused.zIndex,
    ]).toEqual([1, 1, 0, 0, 0, 1, 0xffffff, 0]);
    reused.destroy();
    container.destroy();
  });

  it("resets graphics appearance and clears the previous drawing", () => {
    const renderer = Object.create(Renderer.prototype) as PoolHarness;
    renderer.spritePool = [];
    renderer.graphicsPool = [];
    const container = new Container();
    const graphics = new Graphics().rect(0, 0, 20, 20).fill(0xff0000);
    graphics.alpha = 0.2;
    graphics.zIndex = 50;
    container.addChild(graphics);
    renderer.destroyFrameChildren(container);
    const reused = renderer.acquireGraphics();
    expect(reused).toBe(graphics);
    expect([reused.alpha, reused.zIndex]).toEqual([1, 0]);
    expect(reused.context.instructions).toHaveLength(0);
    reused.destroy();
    container.destroy();
  });
});
