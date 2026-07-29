// policyStateId: full-page-capture-leases - export-run cancellation is an in-memory facet of
// the active durable capture lease.
const activeExportRuns = new Map<string, AbortController>();

export function registerFullPageExportRun(exportRunId: string | undefined): {
  release(): void;
  signal?: AbortSignal;
} {
  if (exportRunId === undefined) return { release: () => undefined };
  if (activeExportRuns.has(exportRunId)) {
    throw new Error('A full-page capture already owns this export run');
  }
  const controller = new AbortController();
  activeExportRuns.set(exportRunId, controller);
  return {
    release() {
      if (activeExportRuns.get(exportRunId) === controller) activeExportRuns.delete(exportRunId);
    },
    signal: controller.signal,
  };
}

export function cancelFullPageCaptureByExportRunId(exportRunId: string): boolean {
  const controller = activeExportRuns.get(exportRunId);
  if (!controller) return false;
  controller.abort(new Error('Full-page capture cancelled'));
  return true;
}

export function throwIfFullPageCaptureAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Full-page capture cancelled');
}
