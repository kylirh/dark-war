/** Stable identities and portal contracts for independently simulated planes. */

export interface WorldAddress {
  readonly spaceId: string;
  readonly planeId: string;
}

export type PortalKind = "door" | "stairs" | "ladder" | "cave-mouth" | "hole";

export interface WorldPortalEndpoint extends WorldAddress {
  readonly x: number;
  readonly y: number;
}

export interface WorldPortal {
  readonly id: string;
  readonly kind: PortalKind;
  readonly source: WorldPortalEndpoint;
  readonly destination: WorldPortalEndpoint;
  readonly oneWay?: boolean;
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
