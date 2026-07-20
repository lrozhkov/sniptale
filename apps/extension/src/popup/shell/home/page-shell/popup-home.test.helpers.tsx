import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { QuickAction } from '../../../../contracts/settings';
import type { GalleryStatus } from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function getContainer() {
  return container;
}

export async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

export function cleanupRenderedNode() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

export function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: overrides.id ?? 'action-1',
    status: overrides.status ?? true,
    name: overrides.name ?? 'Visible capture',
    icon: overrides.icon ?? 'Camera',
    origin: overrides.origin ?? 'user',
    bundledId: overrides.bundledId ?? null,
    hotkey: overrides.hotkey ?? {
      altKey: false,
      ctrlKey: true,
      key: 'K',
      metaKey: false,
      shiftKey: true,
    },
    screenshotMode: overrides.screenshotMode ?? 'visible',
    emulation: overrides.emulation ?? null,
    delay: overrides.delay ?? null,
    afterCapture: overrides.afterCapture ?? 'download_default',
    imageFormat: overrides.imageFormat ?? null,
    imageQuality: overrides.imageQuality ?? null,
    exitAfterCapture: overrides.exitAfterCapture ?? false,
  };
}

export function createActiveTabCapabilities(
  overrides: Partial<ActiveTabCapabilities> = {}
): ActiveTabCapabilities {
  const supportedState = { supported: true, reason: null };

  return {
    tabId: 1,
    url: 'https://example.com',
    title: 'Example',
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: supportedState,
    quickActions: supportedState,
    export: supportedState,
    videoByMode: {} as ActiveTabCapabilities['videoByMode'],
    ...overrides,
  };
}

export function createGalleryStatus(overrides: Partial<GalleryStatus> = {}): GalleryStatus {
  return {
    pressure: overrides.pressure ?? 'healthy',
    text: overrides.text ?? 'Gallery usage healthy',
  };
}
