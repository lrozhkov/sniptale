import { vi } from 'vitest';

import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../features/video/project/types';
import type { BackgroundProjectExportPorts } from './ports';

export const PROJECT_EXPORT_OWNER = {
  documentId: 'document-1',
  senderUrl: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
};

export function createProjectExportSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

export function createProjectExportInputReference(jobId = 'job-1') {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

export function createProjectExportPorts(): BackgroundProjectExportPorts {
  const sendRuntimeMessage = vi.fn(async () => ({
    success: true,
  })) as BackgroundProjectExportPorts['sendRuntimeMessage'];
  return {
    attachOffscreenCommandCapability: <T extends { type: string }>(message: T) => ({
      ...message,
      capabilityToken: 'offscreen',
    }),
    consumeProjectExportCancelCapability: vi.fn(async () => true),
    deleteProjectExportInput: vi.fn(async () => undefined),
    ensureOffscreenDocument: vi.fn(async () => false),
    hasOffscreenDocument: vi.fn(() => true),
    issueProjectExportCancelCapability: vi.fn(async () => 'cancel-token'),
    issueProjectExportStartCapability: vi.fn(async () => 'start-token'),
    loadActiveProjectExportJobLedgerEntry: vi.fn(async () => null),
    loadProjectExportInput: vi.fn(async () => createProject()),
    markProjectExportJobTerminal: vi.fn(async () => undefined),
    reconcileProjectExportLedgerAfterOffscreenCreation: vi.fn(async () => undefined),
    requestProjectExportJobCancel: vi.fn(async () => undefined),
    reserveProjectExportJobLedgerEntry: vi.fn(async () => undefined),
    sendRuntimeMessage,
    waitForOffscreenReady: vi.fn(async () => undefined),
  };
}

function createProject(): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [],
    createdAt: 1,
    cursorTrack: null,
    duration: 10,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    tracks: [],
    updatedAt: 1,
    version: 2,
    width: 1280,
  };
}
