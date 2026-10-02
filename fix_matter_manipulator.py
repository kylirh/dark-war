import re

with open("src/engine/systems/simulation/matter-manipulator.test.ts", "r") as f:
    content = f.read()

# Fix return type:
content = content.replace("function setupMatterManipulatorTest() {", "function setupMatterManipulatorTest(): { game: Game, state: ReturnType<Game[\"getState\"]>, tileX: number, tileY: number } {")

# Also find other usages of the duplicated block and replace them
pattern = r"""    const game = new Game\(\{ mode: "offline" \}\);\n    game\.reset\(1\);\n    const state = game\.getState\(\);\n    state\.player\.hasMatterManipulator = true;\n    const tileX = state\.player\.gridX \+ 1;\n    const tileY = state\.player\.gridY;"""
content = re.sub(pattern, "    const { game, state, tileX, tileY } = setupMatterManipulatorTest();", content)

with open("src/engine/systems/simulation/matter-manipulator.test.ts", "w") as f:
    f.write(content)
