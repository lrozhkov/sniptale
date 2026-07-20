// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureToastHostAdapter,
  type ToastHostAdapter,
} from '@sniptale/ui/product-feedback/toast-service';

const capturedAdapters: ToastHostAdapter[] = [];

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  configureToastHostAdapter: vi.fn((adapter: ToastHostAdapter | null) => {
    if (adapter) {
      capturedAdapters.push(adapter);
    }
  }),
}));

describe('content toast host adapter', () => {
  beforeEach(() => {
    capturedAdapters.length = 0;
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers content-owned toast mounting and cleanup', async () => {
    const { installContentToastHostAdapter } = await import('./toast-host');

    const cleanup = installContentToastHostAdapter();
    cleanup();

    expect(configureToastHostAdapter).toHaveBeenNthCalledWith(1, capturedAdapters[0]);
    expect(configureToastHostAdapter).toHaveBeenNthCalledWith(2, null);
  });

  it('mounts toast hosts through the content overlay root', async () => {
    const { installContentToastHostAdapter } = await import('./toast-host');
    installContentToastHostAdapter();
    const container = document.createElement('div');

    capturedAdapters[0]?.appendHost(container);

    expect(document.body.contains(container)).toBe(true);
  });

  it('reports hidden content UI state through the content host adapter', async () => {
    const app = document.createElement('div');
    app.className = 'sniptale-app';
    app.setAttribute('data-hidden', 'true');
    document.body.append(app);

    const { installContentToastHostAdapter } = await import('./toast-host');
    installContentToastHostAdapter();

    expect(capturedAdapters[0]?.isHidden()).toBe(true);
  });
});
