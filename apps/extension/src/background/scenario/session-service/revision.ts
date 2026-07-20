export function syncScenarioProjectRevision(
  revisions: Map<number, number>,
  tabId: number,
  options: { hasActiveProject?: boolean } = {}
): number {
  const currentRevision = revisions.get(tabId);
  if (typeof currentRevision === 'number') {
    return currentRevision;
  }

  const nextRevision = options.hasActiveProject ? 1 : 0;
  revisions.set(tabId, nextRevision);
  return nextRevision;
}

export async function bumpScenarioProjectRevision(
  revisions: Map<number, number>,
  tabId: number
): Promise<number> {
  const currentRevision = revisions.get(tabId) ?? 0;
  const nextRevision = currentRevision + 1;
  revisions.set(tabId, nextRevision);
  return nextRevision;
}

export function clearScenarioProjectRevision(revisions: Map<number, number>, tabId: number): void {
  revisions.delete(tabId);
}
