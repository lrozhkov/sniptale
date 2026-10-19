// policyStateId: capture-surface-leases - the content client keeps only its minted lease binding.
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

let surfaceCapabilityToken: string | null = null;
let surfaceLeaseGeneration: number | null = null;
let surfaceOperationGeneration = 0;
let surfaceBindingRevision = 0;

type ScreenshotSurfaceBinding = {
  leaseGeneration?: number;
  operationGeneration?: number;
  token: string | null;
};

export type ScreenshotSurfaceBindingSnapshot = {
  surfaceCapabilityToken: string;
  surfaceLeaseGeneration?: number;
  surfaceOperationGeneration: number;
};

export function setScreenshotSurfaceCapabilityToken(token: string | null): void {
  surfaceBindingRevision += 1;
  if (surfaceCapabilityToken !== token) {
    surfaceLeaseGeneration = null;
    surfaceOperationGeneration = 0;
  }
  surfaceCapabilityToken = token;
}

export function setScreenshotSurfaceBinding(args: ScreenshotSurfaceBinding): void {
  setScreenshotSurfaceCapabilityToken(args.token);
  surfaceOperationGeneration = args.operationGeneration ?? surfaceOperationGeneration;
  surfaceLeaseGeneration = args.leaseGeneration ?? null;
}

export function createScreenshotSurfaceStatusBindingUpdater() {
  const revision = surfaceBindingRevision;
  return (binding: ScreenshotSurfaceBinding): boolean => {
    if (revision !== surfaceBindingRevision) return false;
    setScreenshotSurfaceBinding(binding);
    return true;
  };
}

export function nextScreenshotSurfaceOperationGeneration(): number {
  surfaceBindingRevision += 1;
  surfaceOperationGeneration += 1;
  return surfaceOperationGeneration;
}

export function requireScreenshotSurfaceCapabilityToken(): string {
  if (!surfaceCapabilityToken) throw new Error('Screenshot surface capability is unavailable');
  return surfaceCapabilityToken;
}

export function getScreenshotSurfaceCapabilityToken(): string | null {
  return surfaceCapabilityToken;
}

export function getScreenshotSurfaceLeaseGeneration(): number | null {
  return surfaceLeaseGeneration;
}

export function createDisableScreenshotModeRequest(binding?: ScreenshotSurfaceBindingSnapshot) {
  if (binding) {
    setScreenshotSurfaceBinding({
      token: binding.surfaceCapabilityToken,
      operationGeneration: binding.surfaceOperationGeneration,
      ...(binding.surfaceLeaseGeneration === undefined
        ? {}
        : { leaseGeneration: binding.surfaceLeaseGeneration }),
    });
  }
  const surfaceCapabilityToken = requireScreenshotSurfaceCapabilityToken();
  const operationGeneration = nextScreenshotSurfaceOperationGeneration();
  return {
    type: MessageType.DISABLE_SCREENSHOT_MODE,
    operationGeneration,
    surfaceCapabilityToken,
    ...(surfaceLeaseGeneration === null ? {} : { leaseGeneration: surfaceLeaseGeneration }),
  } as const;
}
