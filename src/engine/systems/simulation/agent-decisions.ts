/**
 * Persisted, inspectable goal selection for agent-bearing actors.
 *
 * Random-looking decisions key from `decisionEpoch`; the counter advances only
 * when an actor makes a decision and therefore survives save/load unchanged.
 */

import {
  AgentComponent,
  AgentDecisionScore,
  AgentGoal,
  Entity,
} from "../../types";

const DEFAULT_DECISION_INTERVAL_TICKS = 20;

/** Ensure older hydrated actors receive the current agent state shape. */
export function ensureAgent(entity: Entity): AgentComponent {
  return (entity.agent ??= {
    decisionEpoch: 0,
    nextDecisionTick: 0,
    currentGoal: "idle",
  });
}

/** Advance and return the persisted epoch for a distinct actor decision. */
export function advanceAgentDecisionEpoch(entity: Entity): number {
  const agent = ensureAgent(entity);
  const epoch = agent.decisionEpoch;
  agent.decisionEpoch += 1;
  return epoch;
}

/**
 * Select the highest-scoring goal on a slow cadence and retain the full score
 * breakdown for a development inspector.
 */
export function selectAgentGoal(
  entity: Entity,
  tick: number,
  candidates: AgentDecisionScore[],
  intervalTicks: number = DEFAULT_DECISION_INTERVAL_TICKS,
): AgentGoal {
  const agent = ensureAgent(entity);
  if (tick < agent.nextDecisionTick) return agent.currentGoal;

  const selected = candidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );
  advanceAgentDecisionEpoch(entity);
  agent.currentGoal = selected.goal;
  agent.nextDecisionTick = tick + intervalTicks;
  agent.lastDecision = {
    tick,
    selected: selected.goal,
    candidates: candidates.map((candidate) => ({ ...candidate })),
  };
  if (selected.goal !== "work") agent.activity = undefined;
  return selected.goal;
}
