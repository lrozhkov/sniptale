export type OffscreenManagerState = {
  offscreenCreated: boolean;
  offscreenReady: boolean;
  startupFailed: boolean;
  expectedStartupId: string | null;
};

export function createInitialOffscreenManagerState(): OffscreenManagerState {
  return {
    offscreenCreated: false,
    offscreenReady: false,
    startupFailed: false,
    expectedStartupId: null,
  };
}
