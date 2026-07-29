// policyStateId: capture-surface-leases - document capabilities are in-memory facets of the active surface lease.
type ScreenshotSurfaceSession = {
  activeLeaseGeneration: number | null;
  capabilityToken: string;
  documentId: string | null;
  generation: number;
  lastOperationGeneration: number;
  sessionId: string;
};

export type ScreenshotSurfaceBinding = {
  surfaceCapabilityToken: string;
  surfaceLeaseGeneration?: number;
  surfaceOperationGeneration: number;
};

const sessions = new Map<number, ScreenshotSurfaceSession>();

export function beginScreenshotSurfaceSession(tabId: number): ScreenshotSurfaceSession {
  const existing = sessions.get(tabId);
  if (existing) return existing;
  const session = {
    activeLeaseGeneration: null,
    capabilityToken: crypto.randomUUID(),
    documentId: null,
    generation: 0,
    lastOperationGeneration: 0,
    sessionId: crypto.randomUUID(),
  };
  sessions.set(tabId, session);
  return session;
}

export function authorizeScreenshotSurfaceMutation(args: {
  capabilityToken: string;
  documentId: string | null | undefined;
  tabId: number;
}): boolean {
  const session = sessions.get(args.tabId);
  if (!session || !args.documentId || session.capabilityToken !== args.capabilityToken)
    return false;
  if (session.documentId === null) session.documentId = args.documentId;
  return session.documentId === args.documentId;
}

export function claimScreenshotSurfaceApply(args: {
  capabilityToken: string;
  documentId: string | null | undefined;
  operationGeneration: number;
  tabId: number;
}): ScreenshotSurfaceSession | null {
  if (!authorizeScreenshotSurfaceMutation(args)) return null;
  const session = sessions.get(args.tabId)!;
  if (
    !Number.isInteger(args.operationGeneration) ||
    args.operationGeneration <= session.lastOperationGeneration
  ) {
    return null;
  }
  session.lastOperationGeneration = args.operationGeneration;
  session.generation = args.operationGeneration;
  return session;
}

export function claimScreenshotSurfaceRelease(args: {
  capabilityToken: string;
  documentId: string | null | undefined;
  leaseGeneration: number;
  operationGeneration: number;
  tabId: number;
}): ScreenshotSurfaceSession | null {
  if (!authorizeScreenshotSurfaceMutation(args)) return null;
  const session = sessions.get(args.tabId)!;
  if (
    !Number.isInteger(args.operationGeneration) ||
    args.operationGeneration <= session.lastOperationGeneration ||
    args.leaseGeneration !== session.activeLeaseGeneration
  ) {
    return null;
  }
  session.lastOperationGeneration = args.operationGeneration;
  return session;
}

export function claimScreenshotModeDisable(args: {
  capabilityToken: string;
  documentId: string | null | undefined;
  leaseGeneration: number | null | undefined;
  operationGeneration: number | undefined;
  tabId: number;
}): ScreenshotSurfaceSession | null {
  if (!authorizeScreenshotSurfaceMutation(args)) return null;
  const session = sessions.get(args.tabId)!;
  if (
    typeof args.operationGeneration !== 'number' ||
    !Number.isInteger(args.operationGeneration) ||
    args.operationGeneration <= session.lastOperationGeneration ||
    (args.leaseGeneration ?? null) !== session.activeLeaseGeneration
  ) {
    return null;
  }
  session.lastOperationGeneration = args.operationGeneration;
  return session;
}

export function markScreenshotSurfaceApplied(tabId: number, generation: number): void {
  const session = sessions.get(tabId);
  if (!session || session.generation !== generation) return;
  session.activeLeaseGeneration = generation;
}

export function markScreenshotSurfaceReleased(tabId: number, generation: number): void {
  const session = sessions.get(tabId);
  if (!session || session.activeLeaseGeneration !== generation) return;
  session.activeLeaseGeneration = null;
}

export function setScreenshotSurfaceActiveLeaseGeneration(
  tabId: number,
  generation: number | null
): void {
  const session = sessions.get(tabId);
  if (session) session.activeLeaseGeneration = generation;
}

export function renewScreenshotSurfaceCapability(args: {
  documentId: string;
  tabId: number;
}): ScreenshotSurfaceSession {
  const session = beginScreenshotSurfaceSession(args.tabId);
  session.capabilityToken = crypto.randomUUID();
  session.documentId = args.documentId;
  return session;
}

export function bindScreenshotSurfaceSession(args: {
  documentId: string;
  tabId: number;
}): ScreenshotSurfaceSession | null {
  const session = sessions.get(args.tabId);
  if (!session || (session.documentId !== null && session.documentId !== args.documentId)) {
    return null;
  }
  session.documentId = args.documentId;
  return session;
}

export function getScreenshotSurfaceCapabilityForDocument(args: {
  documentId: string | null | undefined;
  tabId: number;
}): string | null {
  const session = sessions.get(args.tabId);
  return session && args.documentId && session.documentId === args.documentId
    ? session.capabilityToken
    : null;
}

export function getScreenshotSurfaceSession(tabId: number): ScreenshotSurfaceSession | null {
  return sessions.get(tabId) ?? null;
}

export function getScreenshotSurfaceBinding(tabId: number): ScreenshotSurfaceBinding | null {
  const session = sessions.get(tabId);
  if (!session) return null;
  return {
    surfaceCapabilityToken: session.capabilityToken,
    surfaceOperationGeneration: session.lastOperationGeneration,
    ...(session.activeLeaseGeneration === null
      ? {}
      : { surfaceLeaseGeneration: session.activeLeaseGeneration }),
  };
}

export function nextScreenshotSurfaceGeneration(tabId: number): ScreenshotSurfaceSession {
  const session = beginScreenshotSurfaceSession(tabId);
  session.generation += 1;
  session.lastOperationGeneration = session.generation;
  return session;
}

export function endScreenshotSurfaceSession(tabId: number): void {
  sessions.delete(tabId);
}

export function getScreenshotSurfaceSessionTabIds(): number[] {
  return [...sessions.keys()];
}

export function resetScreenshotSurfaceSessionsForTests(): void {
  sessions.clear();
}
