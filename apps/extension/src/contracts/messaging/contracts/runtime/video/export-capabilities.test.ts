import { expect, it } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../../../../features/video/project/types/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoExportCapabilityContracts } from './export-capabilities';

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

it('parses editor export capability requests and token responses', () => {
  expect(
    runtimeVideoExportCapabilityContracts[
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
    runtimeVideoExportCapabilityContracts[
      VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES
    ].parseResponse({
      success: true,
      cancelCapabilityToken: 'cancel-token-1',
      capabilityToken: 'start-token-1',
      ownerDocumentId: 'editor-doc-1',
    })
  ).toEqual(
    expect.objectContaining({
      cancelCapabilityToken: 'cancel-token-1',
      capabilityToken: 'start-token-1',
      ownerDocumentId: 'editor-doc-1',
    })
  );

  expect(() =>
    runtimeVideoExportCapabilityContracts[
      VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES
    ].parseRequest({
      type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
      settings: { ...createExportSettings(), quality: 'balanced' },
    })
  ).toThrow(/GET_PROJECT_EXPORT_CAPABILITIES/);
});

it('parses offscreen export capability responses', () => {
  expect(
    runtimeVideoExportCapabilityContracts[
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
