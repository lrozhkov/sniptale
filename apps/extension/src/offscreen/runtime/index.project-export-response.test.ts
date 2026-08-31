import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { buildProjectExportCommandSuccessResponse } from './project-export-response';

it('serializes project export completions with an exact command-specific outcome', () => {
  for (const type of [
    VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
  ] as const) {
    expect(buildProjectExportCommandSuccessResponse(type, 'accepted')).toEqual({
      result: 'accepted',
      success: true,
    });
    expect(() => buildProjectExportCommandSuccessResponse(type, undefined)).toThrow(
      `Invalid ${type} completion`
    );
    expect(() => buildProjectExportCommandSuccessResponse(type, { result: 'unexpected' })).toThrow(
      `Invalid ${type} completion`
    );
  }
});
