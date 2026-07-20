import { expect, it } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../../../../features/video/project/types/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoExportMessageContracts } from './export';

function createProjectExportInput(jobId = 'job-1') {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createExportSettings() {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

function createProjectExportRequest() {
  return {
    capabilityToken: 'start-token-1',
    input: createProjectExportInput(),
    jobId: 'job-1',
    settings: createExportSettings(),
    type: VideoMessageType.START_PROJECT_EXPORT,
  };
}

function createCompletedExportMessage() {
  return {
    exportId: 'export-1',
    filename: 'clip.mp4',
    format: 'mp4',
    jobId: 'job-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
  };
}

function createDiagnosticEventMessage() {
  return {
    event: 'recording_started',
    level: 'info',
    payload: {},
    recordingId: 'recording-1',
    type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
  };
}

it('parses project export lifecycle messages across popup and offscreen seams', () => {
  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseRequest(
      createProjectExportRequest()
    )
  ).toEqual(
    expect.objectContaining({
      jobId: 'job-1',
      type: VideoMessageType.START_PROJECT_EXPORT,
    })
  );

  expect(
    runtimeVideoExportMessageContracts[
      VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT
    ].parseResponse(undefined)
  ).toBeUndefined();

  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.PROJECT_EXPORT_COMPLETED].parseRequest(
      createCompletedExportMessage()
    )
  ).toEqual(expect.objectContaining({ exportId: 'export-1', format: 'mp4' }));
});

it('rejects malformed project export input references and settings payloads', () => {
  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseRequest({
      ...createProjectExportRequest(),
      capabilityToken: undefined,
    })
  ).toThrow(/START_PROJECT_EXPORT/);

  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.CANCEL_PROJECT_EXPORT].parseRequest({
      jobId: 'job-1',
      type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    })
  ).toThrow(/CANCEL_PROJECT_EXPORT/);

  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseRequest({
      ...createProjectExportRequest(),
      input: { jobId: 'job-1' },
    })
  ).toThrow(/START_PROJECT_EXPORT/);

  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseRequest({
      ...createProjectExportRequest(),
      input: { ...createProjectExportInput(), extra: true },
    })
  ).toThrow(/START_PROJECT_EXPORT/);

  expect(() =>
    runtimeVideoExportMessageContracts[
      VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT
    ].parseRequest({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: 'offscreen-token',
      input: createProjectExportInput(),
      jobId: 'job-1',
      settings: { ...createExportSettings(), format: 'mp4' },
    })
  ).toThrow(/OFFSCREEN_START_PROJECT_EXPORT/);
});

it('parses recordingId-only download messages and rejects arbitrary URL payloads', () => {
  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.DOWNLOAD_RECORDING].parseRequest({
      filename: 'capture.webm',
      recordingId: 'recording-1',
      type: VideoMessageType.DOWNLOAD_RECORDING,
    })
  ).toEqual(
    expect.objectContaining({
      filename: 'capture.webm',
      recordingId: 'recording-1',
      type: VideoMessageType.DOWNLOAD_RECORDING,
    })
  );

  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.DOWNLOAD_RECORDING].parseRequest({
      filename: 'capture.webm',
      type: VideoMessageType.DOWNLOAD_RECORDING,
      url: 'blob:recording',
    })
  ).toThrow();

  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.DOWNLOAD_RECORDING_SIDECAR].parseRequest({
      content: 'WEBVTT',
      filename: 'capture.vtt',
      mimeType: 'text/vtt',
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
    })
  ).toEqual(
    expect.objectContaining({
      content: 'WEBVTT',
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
    })
  );
});

it('requires recording ids for saved-video notifications', () => {
  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.VIDEO_SAVED_TO_IDB].parseRequest({
      projectId: 'project-1',
      recordingId: 'recording-1',
      type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    })
  ).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      recordingId: 'recording-1',
    })
  );
  expect(() =>
    runtimeVideoExportMessageContracts[VideoMessageType.VIDEO_SAVED_TO_IDB].parseRequest({
      type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    })
  ).toThrow(/VIDEO_SAVED_TO_IDB/);
  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.VIDEO_SAVED_TO_IDB].parseResponse({
      success: true,
      result: 'accepted',
    })
  ).toEqual({
    success: true,
    result: 'accepted',
  });
});

it('parses diagnostic runtime messages', () => {
  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS].parseRequest(
      createDiagnosticEventMessage()
    )
  ).toEqual(
    expect.objectContaining({
      event: 'recording_started',
      type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
    })
  );

  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS].parseRequest({
      ...createDiagnosticEventMessage(),
      payload: 'primitive diagnostic payload',
    })
  ).toEqual(
    expect.objectContaining({
      payload: 'primitive diagnostic payload',
      type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
    })
  );
});

it('parses editor project export capability requests and token responses', () => {
  expect(
    runtimeVideoExportMessageContracts[
      VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES
    ].parseRequest({
      jobId: 'job-1',
      type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
      settings: createExportSettings(),
    })
  ).toEqual(
    expect.objectContaining({
      type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
      jobId: 'job-1',
      settings: expect.objectContaining({ format: VideoExportFormat.MP4 }),
    })
  );

  expect(
    runtimeVideoExportMessageContracts[
      VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES
    ].parseResponse({
      success: true,
      capabilityToken: 'start-token-1',
    })
  ).toEqual(expect.objectContaining({ capabilityToken: 'start-token-1' }));

  expect(() =>
    runtimeVideoExportMessageContracts[
      VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES
    ].parseRequest({
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      settings: { ...createExportSettings(), quality: 'balanced' },
    })
  ).toThrow(/OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES/);
});

it('parses offscreen project export capability responses', () => {
  expect(
    runtimeVideoExportMessageContracts[
      VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES
    ].parseResponse({
      success: true,
      capabilities: {
        formats: [{ format: 'mp4', available: true }],
        mp4Codecs: [{ codec: 'AVC', available: true }],
        defaultMp4VideoCodec: 'AVC',
      },
    })
  ).toEqual(
    expect.objectContaining({
      success: true,
      capabilities: expect.objectContaining({
        defaultMp4VideoCodec: 'AVC',
      }),
    })
  );
});
