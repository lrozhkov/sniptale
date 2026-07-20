export type PageAccessPort = {
  ensureActivePageAccessRuntime(tabId: number, failureMessage?: string): Promise<void>;
  ensureNativeVisibleCaptureAuthority(tabId: number, failureMessage?: string): Promise<void>;
};
