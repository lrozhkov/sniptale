export type OffscreenDocumentState = {
  creationPromise: Promise<boolean> | null;
  offscreenCreated: boolean;
  offscreenReady: boolean;
  startupFailed: boolean;
  expectedStartupId: string | null;
};

export function createInitialOffscreenDocumentState(): OffscreenDocumentState {
  return {
    creationPromise: null,
    offscreenCreated: false,
    offscreenReady: false,
    startupFailed: false,
    expectedStartupId: null,
  };
}
