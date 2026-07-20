// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectAdvancedLogAssets, startExportHarCapture, stopExportHarCapture } from '.';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';
import {
  installContentRuntimeMessagingMock,
  resetContentRuntimeMessagingMock,
} from '../../../platform/runtime-services/services.test-support';

const mockedSendRuntimeMessage = vi.mocked(sendRuntimeMessage);

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal()),
  runtimeInfo: {
    getManifest: () => ({ version: '0.4.0' }),
  },
}));

function createAdvancedLogOptions(enabled: boolean) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: enabled,
    includeImages: false,
    includeJson: false,
    includeMarkdown: false,
  };
}

function createCanonicalTree(): ParsedDOMTree {
  return {
    context: 'Portal',
    title: 'Tree title',
    structure: [],
    meta: {
      profile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      title: 'Canonical HAR title',
      url: 'https://example.test/canonical-har',
      warnings: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessage);
  vi.mocked(sendRuntimeMessage).mockResolvedValue({
    success: true,
    capabilityToken: 'har-token',
    expiresAtEpochMs: 123,
  });
});

afterEach(() => {
  resetContentRuntimeMessagingMock();
});

describe('collectAdvancedLogAssets', () => {
  it('returns advanced assets only when HAR/DOM logs are enabled', async () => {
    const assets = await collectAdvancedLogAssets(
      createAdvancedLogOptions(true),
      { har: { log: { entries: [] } }, rawDiagnosticsEnabled: false },
      createCanonicalTree()
    );

    expect(assets.map((asset) => asset.path)).toEqual([
      'logs/dom.html',
      'logs/virtual-dom.html',
      'logs/resource-timing.har.json',
      'logs/session.har',
    ]);
  });

  it('returns no advanced assets when the option is disabled', async () => {
    await expect(
      collectAdvancedLogAssets(
        createAdvancedLogOptions(false),
        { har: { log: { entries: [] } }, rawDiagnosticsEnabled: false },
        createCanonicalTree()
      )
    ).resolves.toEqual([]);
  });
});

describe('HAR transport start helpers', () => {
  it('starts HAR capture through runtime transport', async () => {
    await expect(startExportHarCapture('session-1')).resolves.toEqual({
      capabilityToken: 'har-token',
      expiresAtEpochMs: 123,
      sessionId: 'session-1',
    });

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-1',
      type: 'REQUEST_EXPORT_HAR_START_CAPABILITY',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      capabilityToken: 'har-token',
      sessionId: 'session-1',
      type: 'EXPORT_START_HAR',
    });
  });

  it('throws when starting HAR capture fails', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: 'boom',
    });

    await expect(startExportHarCapture('session-2')).rejects.toThrow('boom');
  });

  it('throws when starting HAR capture does not return a capability', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
    });

    await expect(startExportHarCapture('session-no-token')).rejects.toThrow(
      'Failed to authorize HAR collection.'
    );
  });
});

describe('HAR transport raw start authority', () => {
  it('requests raw HAR only through the start capability request', async () => {
    await startExportHarCapture('session-raw', { rawDiagnosticsEnabled: true });

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      rawDiagnosticsEnabled: true,
      sessionId: 'session-raw',
      type: 'REQUEST_EXPORT_HAR_START_CAPABILITY',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      capabilityToken: 'har-token',
      sessionId: 'session-raw',
      type: 'EXPORT_START_HAR',
    });
  });
});

describe('HAR transport stop helpers', () => {
  it('stops HAR capture and returns the payload', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      har: { log: { entries: [] } },
      rawDiagnosticsEnabled: true,
    });

    await expect(
      stopExportHarCapture({
        capabilityToken: 'har-token-3',
        expiresAtEpochMs: 123,
        sessionId: 'session-3',
      })
    ).resolves.toEqual({
      har: { log: { entries: [] } },
      rawDiagnosticsEnabled: true,
    });
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      capabilityToken: 'har-token-3',
      sessionId: 'session-3',
      type: 'EXPORT_STOP_HAR',
    });
  });
});

describe('HAR transport stop failure helpers', () => {
  it('throws when stopping HAR capture fails', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: 'stop failed',
    });

    await expect(
      stopExportHarCapture({
        capabilityToken: 'har-token-4',
        expiresAtEpochMs: 123,
        sessionId: 'session-4',
      })
    ).rejects.toThrow('stop failed');
  });

  it('throws when stopping HAR capture returns a non-object payload', async () => {
    mockedSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      har: 'invalid-har',
    } as unknown as Awaited<ReturnType<typeof sendRuntimeMessage>>);

    await expect(
      stopExportHarCapture({
        capabilityToken: 'har-token-5',
        expiresAtEpochMs: 123,
        sessionId: 'session-5',
      })
    ).rejects.toThrow('Failed to stop HAR collection.');
  });
});

describe('HAR transport raw diagnostics gate', () => {
  it('keeps raw HAR payload parsing behind mandatory credential redaction', async () => {
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        har: { request: { url: 'https://example.test/path?token=known-secret&q=public#frag' } },
      })
      .mockResolvedValueOnce({
        success: true,
        har: {
          request: {
            headers: { Authorization: 'Bearer known-secret' },
            url: 'https://example.test/path?token=known-secret&q=public#frag',
          },
        },
        rawDiagnosticsEnabled: true,
      });

    await expect(
      stopExportHarCapture({
        capabilityToken: 'har-token-sanitized',
        expiresAtEpochMs: 123,
        sessionId: 'session-sanitized',
      })
    ).resolves.toEqual({
      har: { request: { url: 'https://example.test/path' } },
      rawDiagnosticsEnabled: false,
    });
    await expect(
      stopExportHarCapture({
        capabilityToken: 'har-token-raw',
        expiresAtEpochMs: 123,
        sessionId: 'session-raw',
      })
    ).resolves.toEqual({
      har: {
        request: {
          headers: { Authorization: '***' },
          url: 'https://example.test/path?token=***&q=public',
        },
      },
      rawDiagnosticsEnabled: true,
    });
  });
});
