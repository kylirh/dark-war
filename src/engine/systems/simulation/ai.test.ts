import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAICommands } from "./ai";
import { EntityKind, GameState, Monster, CommandType } from "../../types";
import { EntityManager } from "../../core/entity-manager";
import * as simHelpers from "./sim-helpers";

// Mock the helper so we can control `canActorAct`
vi.mock("./sim-helpers", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    canActorAct: vi.fn(),
  };
});

describe("generateAICommands", () => {
  let mockState: GameState;

  beforeEach(() => {
    vi.resetAllMocks();
    mockState = {
      entities: [],
      conversations: new Map(),
      entityManager: new EntityManager([]),
    } as unknown as GameState;
  });

  it("returns an empty array when there are no entities", () => {
    const commands = generateAICommands(mockState, 0);
    expect(commands).toEqual([]);
  });

  it("filters out entities that are not monsters", () => {
    mockState.entities = [
      { id: "p1", kind: EntityKind.PLAYER } as any,
      { id: "i1", kind: EntityKind.ITEM } as any,
    ];
    (simHelpers.canActorAct as any).mockReturnValue(true);

    const commands = generateAICommands(mockState, 0);
    expect(commands).toEqual([]);
  });

  it("filters out monsters that cannot act", () => {
    mockState.entities = [{ id: "m1", kind: EntityKind.MONSTER } as Monster];
    (simHelpers.canActorAct as any).mockReturnValue(false);

    const commands = generateAICommands(mockState, 0);
    expect(commands).toEqual([]);
    expect(simHelpers.canActorAct).toHaveBeenCalledWith(mockState, "m1", 0);
  });

  it("returns commands for monsters that can act", () => {
    const mockMonster = { id: "m1", kind: EntityKind.MONSTER } as Monster;
    mockState.entities = [mockMonster];

    // To safely test without running into unmocked deep simulation logic
    // inside decideMonsterCommand, we put the monster into a conversation.
    // decideMonsterCommand immediately returns a WAIT command in this case.
    mockState.conversations.set("conv1", { speakerId: "m1" } as any);
    (simHelpers.canActorAct as any).mockReturnValue(true);

    const commands = generateAICommands(mockState, 0);
    expect(commands.length).toBe(1);
    expect(commands[0].type).toBe(CommandType.WAIT);
    expect(commands[0].actorId).toBe("m1");
  });

  it("processes multiple acting monsters correctly", () => {
    mockState.entities = [
      { id: "m1", kind: EntityKind.MONSTER } as Monster,
      { id: "p1", kind: EntityKind.PLAYER } as any, // Should be ignored
      { id: "m2", kind: EntityKind.MONSTER } as Monster,
      { id: "m3", kind: EntityKind.MONSTER } as Monster,
    ];

    // Set up conversations for all to return WAIT early
    mockState.conversations.set("conv1", { speakerId: "m1" } as any);
    mockState.conversations.set("conv2", { speakerId: "m2" } as any);
    mockState.conversations.set("conv3", { speakerId: "m3" } as any);

    // Only m1 and m3 can act
    (simHelpers.canActorAct as any).mockImplementation(
      (state: any, id: string) => {
        return id === "m1" || id === "m3";
      },
    );

    const commands = generateAICommands(mockState, 10);

    expect(commands.length).toBe(2);
    expect(commands[0].actorId).toBe("m1");
    expect(commands[0].tick).toBe(10);
    expect(commands[1].actorId).toBe("m3");
    expect(commands[1].tick).toBe(10);
  });
});
