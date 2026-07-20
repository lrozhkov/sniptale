type PendingViewerPortRequest = (error: Error) => void;

export type ViewerPortRegistration = {
  generation: string;
  pendingRequests: Set<PendingViewerPortRequest>;
  port: chrome.runtime.Port;
};

export function startViewerPortRequestLifecycle(
  registration: ViewerPortRegistration,
  args: {
    handleDisconnect: () => void;
    handleMessage: (message: unknown) => void;
    handleStaleRequest: PendingViewerPortRequest;
    handleTimeout: () => void;
    timeoutMs: number;
  }
): () => void {
  registration.pendingRequests.add(args.handleStaleRequest);
  registration.port.onMessage.addListener(args.handleMessage);
  registration.port.onDisconnect.addListener(args.handleDisconnect);
  const timeoutId = setTimeout(args.handleTimeout, args.timeoutMs);

  return () => {
    registration.port.onMessage.removeListener(args.handleMessage);
    registration.port.onDisconnect.removeListener(args.handleDisconnect);
    registration.pendingRequests.delete(args.handleStaleRequest);
    clearTimeout(timeoutId);
  };
}
