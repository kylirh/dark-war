/** Stable identities and portal contracts for independently simulated planes. */

export interface WorldAddress {
  readonly spaceId: string;
  readonly planeId: string;
}

export type PortalKind = "door" | "stairs" | "ladder" | "cave-mouth" | "hole";

export interface WorldPortalSource extends WorldAddress {
  readonly x: number;
  readonly y: number;
}

export type PortalEntry = "start" | "stairs-up" | "stairs-down" | "same";

export interface WorldPortalDestination extends WorldAddress {
  readonly entry: PortalEntry;
  readonly x?: number;
  readonly y?: number;
}

export interface WorldPortal {
  readonly id: string;
  readonly kind: PortalKind;
  readonly source: WorldPortalSource;
  readonly destination: WorldPortalDestination;
  readonly oneWay?: boolean;
}

export function portalAt(
  portals: readonly WorldPortal[],
  address: WorldAddress,
  x: number,
  y: number,
  kinds?: readonly PortalKind[],
): WorldPortal | null {
  return (
    portals.find(
      (portal) =>
        portal.source.spaceId === address.spaceId &&
        portal.source.planeId === address.planeId &&
        portal.source.x === x &&
        portal.source.y === y &&
        (!kinds || kinds.includes(portal.kind)),
    ) ?? null
  );
}

export function worldAddressKey(address: WorldAddress): string {
  return `${address.spaceId}/${address.planeId}`;
}

export function worldAddressForDepth(depth: number): WorldAddress {
  return depth <= 0
    ? { spaceId: "outside", planeId: "surface" }
    : { spaceId: "megacorp", planeId: `floor-${depth}` };
}

export function depthForWorldAddress(address: WorldAddress): number | null {
  if (address.spaceId === "outside" && address.planeId === "surface") return 0;
  if (address.spaceId !== "megacorp") return null;
  const match = /^floor-(\d+)$/.exec(address.planeId);
  return match ? Number(match[1]) : null;
}

export function createProgressionPortals(
  address: WorldAddress,
  depth: number,
  stairsDown: readonly [number, number],
  stairsUp: readonly [number, number] | null,
): WorldPortal[] {
  const downAddress = worldAddressForDepth(depth + 1);
  const portals: WorldPortal[] = [
    {
      id: `${worldAddressKey(address)}:stairs-down`,
      kind: "stairs",
      source: { ...address, x: stairsDown[0], y: stairsDown[1] },
      destination: { ...downAddress, entry: "stairs-up" },
    },
  ];
  if (stairsUp && depth > 0) {
    const upAddress = worldAddressForDepth(depth - 1);
    portals.push({
      id: `${worldAddressKey(address)}:stairs-up`,
      kind: "stairs",
      source: { ...address, x: stairsUp[0], y: stairsUp[1] },
      destination: { ...upAddress, entry: "stairs-down" },
    });
  }
  return portals;
}
