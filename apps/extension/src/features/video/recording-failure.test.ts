import { expect, it, vi } from 'vitest';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { resolveVideoRecordingFailureMessage } from './recording-failure';

it('maps the camera frame-rate failure code to localized copy', () => {
  expect(resolveVideoRecordingFailureMessage('camera-frame-rate-unsupported')).toBe(
    'background.runtime.cameraFrameRateUnsupported'
  );
});

it('does not expose arbitrary runtime failure text', () => {
  expect(resolveVideoRecordingFailureMessage('browser-specific failure')).toBe(
    'background.runtime.recordingError'
  );
  expect(resolveVideoRecordingFailureMessage(null)).toBeNull();
});
