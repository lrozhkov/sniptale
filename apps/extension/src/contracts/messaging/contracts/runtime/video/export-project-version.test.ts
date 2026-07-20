import { expect, it } from 'vitest';

import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../../features/video/project/types/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoExportMessageContracts } from './export';

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createInput(jobId: string) {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

it('accepts the same content-addressed project input contract at both export boundaries', () => {
  const editorInput = createInput('job-1');
  const offscreenInput = createInput('job-offscreen-1');

  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseRequest({
      capabilityToken: 'start-token-1',
      input: editorInput,
      jobId: 'job-1',
      settings: createSettings(),
      type: VideoMessageType.START_PROJECT_EXPORT,
    })
  ).toEqual(expect.objectContaining({ input: editorInput }));

  expect(
    runtimeVideoExportMessageContracts[
      VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT
    ].parseRequest({
      capabilityToken: 'offscreen-start-token-1',
      input: offscreenInput,
      jobId: 'job-offscreen-1',
      settings: createSettings(),
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    })
  ).toEqual(expect.objectContaining({ input: offscreenInput }));
});

it('rejects unbounded, malformed, and expanded input references at both boundaries', () => {
  const malformed = { ...createInput('job-1'), retainedByteLength: 0 };
  const expanded = { ...createInput('job-offscreen-1'), project: { version: 2 } };

  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseRequest({
      capabilityToken: 'start-token-1',
      input: malformed,
      jobId: 'job-1',
      settings: createSettings(),
      type: VideoMessageType.START_PROJECT_EXPORT,
    })
  ).toThrow(/START_PROJECT_EXPORT/);

  expect(() =>
    runtimeVideoExportMessageContracts[
      VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT
    ].parseRequest({
      capabilityToken: 'offscreen-start-token-1',
      input: expanded,
      jobId: 'job-offscreen-1',
      settings: createSettings(),
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    })
  ).toThrow(/OFFSCREEN_START_PROJECT_EXPORT/);
});
