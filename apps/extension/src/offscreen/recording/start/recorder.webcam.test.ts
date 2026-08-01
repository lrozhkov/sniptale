import { expect, it } from 'vitest';
import { buildWebcamRecordingId } from '@sniptale/runtime-contracts/video/types/sidecar';

it('derives the required webcam artifact identity from the primary recording', () => {
  expect(buildWebcamRecordingId('recording-1')).toBe('recording-1-webcam');
});
