export type OffscreenDocumentState = {
  offscreenCreated: boolean;
  offscreenReady: boolean;
  startupFailed: boolean;
  expectedStartupId: string | null;
};

export function createInitialOffscreenDocumentState(): OffscreenDocumentState {
  return {
    offscreenCreated: false,
    offscreenReady: false,
    startupFailed: false,
    expectedStartupId: null,
  };
}
