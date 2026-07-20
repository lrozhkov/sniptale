import { describe, expect, it, vi } from 'vitest';

const getURLMock = vi.hoisted(() => vi.fn((path: string) => `chrome-extension://test/${path}`));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: getURLMock,
  },
}));

import { buildEditorUrl } from './editor';

describe('extension page editor urls', () => {
  it('builds canonical editor urls with only supported params', () => {
    expect(
      buildEditorUrl({
        assetId: 'asset-1',
        bootstrapId: 'bootstrap-1',
        embedMode: 'scenario',
        sessionId: 'session-1',
      })
    ).toBe(
      'chrome-extension://test/apps/extension/src/editor/index.html?embed=scenario&session=session-1' +
        '&bootstrap=bootstrap-1&assetId=asset-1'
    );

    expect(buildEditorUrl({ assetId: null, bootstrapId: '' })).toBe(
      'chrome-extension://test/apps/extension/src/editor/index.html'
    );
    expect(buildEditorUrl()).toBe('chrome-extension://test/apps/extension/src/editor/index.html');
    expect(buildEditorUrl({ embedMode: null, sessionId: null })).toBe(
      'chrome-extension://test/apps/extension/src/editor/index.html'
    );
    expect(getURLMock).toHaveBeenCalledWith('apps/extension/src/editor/index.html');
  });
});
