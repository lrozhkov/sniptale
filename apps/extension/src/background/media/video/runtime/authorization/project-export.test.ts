import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../contracts/video/types/messages';
import {
  issueProjectExportCancelCapability,
  issueProjectExportStartCapability,
  resetProjectExportRuntimeCapabilitiesForTests,
} from '../export-capabilities';
import {
  authorizeProjectExportRuntimeMessage,
  createProjectExportRuntimeMessageAuthorizer,
} from './project-export';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function sender(props: { documentId: string; url: string }): chrome.runtime.MessageSender {
  return { documentId: props.documentId, url: props.url };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

beforeEach(() => {
  resetProjectExportRuntimeCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: () => 'token-1' });
});

afterEach(() => {
  resetProjectExportRuntimeCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('rejects project export start capabilities bound to a different job', async () => {
  const settings = createExportSettings();
  const token = await issueProjectExportStartCapability({
    documentId: 'video-doc-1',
    jobId: 'job-other',
    senderUrl: VIDEO_EDITOR_URL,
    settings,
  });
  const message: VideoRuntimeMessage = {
    capabilityToken: token,
    jobId: 'job-1',
    input: createInputReference(),
    settings,
    type: VideoMessageType.START_PROJECT_EXPORT,
  };

  await expect(
    authorizeProjectExportRuntimeMessage({
      message,
      sender: sender({ documentId: 'video-doc-1', url: VIDEO_EDITOR_URL }),
    })
  ).resolves.toEqual({
    authorized: false,
    reason: 'Unauthorized project export capability',
  });
});

it('allows non-project export runtime messages without project capability checks', async () => {
  await expect(
    authorizeProjectExportRuntimeMessage({
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: sender({ documentId: 'video-doc-1', url: VIDEO_EDITOR_URL }),
    })
  ).resolves.toEqual({ authorized: true });
});

it('authorizes project export start capabilities for the bound editor owner', async () => {
  const settings = createExportSettings();
  const token = await issueProjectExportStartCapability({
    documentId: 'video-doc-1',
    jobId: 'job-1',
    senderUrl: VIDEO_EDITOR_URL,
    settings,
  });
  const message: VideoRuntimeMessage = {
    capabilityToken: token,
    jobId: 'job-1',
    input: createInputReference(),
    settings,
    type: VideoMessageType.START_PROJECT_EXPORT,
  };

  await expect(
    authorizeProjectExportRuntimeMessage({
      message,
      sender: sender({ documentId: 'video-doc-1', url: VIDEO_EDITOR_URL }),
    })
  ).resolves.toEqual({
    authorized: true,
    preauthorization: {
      documentId: 'video-doc-1',
      kind: 'project-export',
      senderUrl: VIDEO_EDITOR_URL,
    },
  });
});

it('authorizes project export cancel capabilities for the bound editor owner', async () => {
  const token = await issueProjectExportCancelCapability({
    documentId: 'video-doc-1',
    jobId: 'job-1',
    senderUrl: VIDEO_EDITOR_URL,
  });

  const message: VideoRuntimeMessage = {
    capabilityToken: token,
    jobId: 'job-1',
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
  };

  await expect(
    authorizeProjectExportRuntimeMessage({
      message,
      sender: sender({ documentId: 'video-doc-1', url: VIDEO_EDITOR_URL }),
    })
  ).resolves.toEqual({
    authorized: true,
    preauthorization: {
      documentId: 'video-doc-1',
      kind: 'project-export',
      senderUrl: VIDEO_EDITOR_URL,
    },
  });
});

it('supports injected project export capability consumers', async () => {
  const consumeProjectExportStartCapability = vi.fn().mockResolvedValue(true);
  const consumeProjectExportCancelCapability = vi.fn().mockResolvedValue(false);
  const authorizeWithInjectedCapabilities = createProjectExportRuntimeMessageAuthorizer({
    consumeProjectExportCancelCapability,
    consumeProjectExportStartCapability,
  });
  const settings = createExportSettings();
  const message: VideoRuntimeMessage = {
    capabilityToken: 'injected-token',
    jobId: 'job-1',
    input: createInputReference(),
    settings,
    type: VideoMessageType.START_PROJECT_EXPORT,
  };

  await expect(
    authorizeWithInjectedCapabilities({
      message,
      sender: sender({ documentId: 'video-doc-1', url: VIDEO_EDITOR_URL }),
    })
  ).resolves.toEqual({
    authorized: true,
    preauthorization: {
      documentId: 'video-doc-1',
      kind: 'project-export',
      senderUrl: VIDEO_EDITOR_URL,
    },
  });
  expect(consumeProjectExportStartCapability).toHaveBeenCalledWith({
    documentId: 'video-doc-1',
    jobId: 'job-1',
    senderUrl: VIDEO_EDITOR_URL,
    settings,
    token: 'injected-token',
  });
  expect(consumeProjectExportCancelCapability).not.toHaveBeenCalled();
});
