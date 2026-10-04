export type OffscreenDocumentState = {
  startupCancellation: AbortController;
  creationPromise: Promise<boolean> | null;
  offscreenCreated: boolean;
  offscreenReady: boolean;
  startupFailed: boolean;
  expectedStartupId: string | null;
};

export function createInitialOffscreenDocumentState(): OffscreenDocumentState {
  return {
    startupCancellation: new AbortController(),
    creationPromise: null,
    offscreenCreated: false,
    offscreenReady: false,
    startupFailed: false,
    expectedStartupId: null,
  };
}

/** Retire waiters before replacing the document identity. */
export function replaceOffscreenStartup(
  state: OffscreenDocumentState,
  startupId: string | null
): void {
  state.startupCancellation.abort(new Error('Offscreen startup replaced'));
  state.startupCancellation = new AbortController();
  state.expectedStartupId = startupId;
}
