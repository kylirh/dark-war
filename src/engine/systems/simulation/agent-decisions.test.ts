import { describe, it, expect, beforeEach } from "vitest";
import {
  ensureAgent,
  advanceAgentDecisionEpoch,
  selectAgentGoal,
} from "./agent-decisions";
import { Entity, AgentGoal, AgentDecisionScore } from "../../types";

describe("agent-decisions", () => {
  let mockEntity: Entity;

  beforeEach(() => {
    // Cast a plain object to Entity for testing purposes
    mockEntity = {} as Entity;
  });

  describe("ensureAgent", () => {
    it("initializes an empty agent state if missing", () => {
      const agent = ensureAgent(mockEntity);

      expect(agent).toEqual({
        decisionEpoch: 0,
        nextDecisionTick: 0,
        currentGoal: "idle",
      });
      expect(mockEntity.agent).toBe(agent);
    });

    it("returns the existing agent state if already present", () => {
      const existingAgent = {
        decisionEpoch: 5,
        nextDecisionTick: 100,
        currentGoal: "work" as AgentGoal,
      };
      mockEntity.agent = existingAgent;

      const agent = ensureAgent(mockEntity);

      expect(agent).toBe(existingAgent);
      expect(mockEntity.agent).toBe(existingAgent);
    });
  });

  describe("advanceAgentDecisionEpoch", () => {
    it("increments decisionEpoch and returns the old epoch", () => {
      mockEntity.agent = {
        decisionEpoch: 5,
        nextDecisionTick: 100,
        currentGoal: "idle" as AgentGoal,
      };

      const oldEpoch = advanceAgentDecisionEpoch(mockEntity);

      expect(oldEpoch).toBe(5);
      expect(mockEntity.agent?.decisionEpoch).toBe(6);
    });

    it("initializes agent state if missing before advancing", () => {
      const oldEpoch = advanceAgentDecisionEpoch(mockEntity);

      expect(oldEpoch).toBe(0);
      expect(mockEntity.agent?.decisionEpoch).toBe(1);
    });
  });

  describe("selectAgentGoal", () => {
    it("returns currentGoal early if tick < nextDecisionTick", () => {
      mockEntity.agent = {
        decisionEpoch: 0,
        nextDecisionTick: 10,
        currentGoal: "flee" as AgentGoal,
      };

      const candidates: AgentDecisionScore[] = [
        { goal: "work", score: 100, reason: "needs work" },
      ];

      const goal = selectAgentGoal(mockEntity, 5, candidates);

      expect(goal).toBe("flee");
      expect(mockEntity.agent.decisionEpoch).toBe(0); // Should not have advanced
    });

    it("selects highest scoring candidate and updates agent state", () => {
      const candidates: AgentDecisionScore[] = [
        { goal: "idle", score: 10, reason: "bored" },
        { goal: "flee", score: 50, reason: "scared" },
        { goal: "work", score: 30, reason: "busy" },
      ];

      const goal = selectAgentGoal(mockEntity, 20, candidates, 5);

      expect(goal).toBe("flee");
      expect(mockEntity.agent?.currentGoal).toBe("flee");
      expect(mockEntity.agent?.nextDecisionTick).toBe(25); // tick(20) + intervalTicks(5)
      expect(mockEntity.agent?.decisionEpoch).toBe(1);
      expect(mockEntity.agent?.lastDecision).toEqual({
        tick: 20,
        selected: "flee",
        candidates,
      });
    });

    it("uses default intervalTicks if not provided", () => {
      const candidates: AgentDecisionScore[] = [
        { goal: "idle", score: 10, reason: "bored" },
      ];

      selectAgentGoal(mockEntity, 20, candidates);

      // DEFAULT_DECISION_INTERVAL_TICKS = 20
      expect(mockEntity.agent?.nextDecisionTick).toBe(40);
    });

    it("clears activity if selected goal is not 'work'", () => {
      mockEntity.agent = {
        decisionEpoch: 0,
        nextDecisionTick: 0,
        currentGoal: "work",
        activity: { kind: "repair", targetX: 1, targetY: 2 },
      };

      const candidates: AgentDecisionScore[] = [
        { goal: "flee", score: 50, reason: "scared" },
      ];

      selectAgentGoal(mockEntity, 0, candidates);

      expect(mockEntity.agent.activity).toBeUndefined();
    });

    it("keeps activity if selected goal is 'work'", () => {
      const activity = { kind: "repair" as const, targetX: 1, targetY: 2 };
      mockEntity.agent = {
        decisionEpoch: 0,
        nextDecisionTick: 0,
        currentGoal: "work",
        activity,
      };

      const candidates: AgentDecisionScore[] = [
        { goal: "work", score: 50, reason: "still busy" },
      ];

      selectAgentGoal(mockEntity, 0, candidates);

      expect(mockEntity.agent.activity).toBe(activity);
    });
  });
});
