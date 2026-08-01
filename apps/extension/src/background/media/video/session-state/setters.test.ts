import { beforeEach, expect, it } from 'vitest';

import { videoManagerSession } from '../manager/session';
import {
  setVideoRecordingCountdownSessionId,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from './setters';

beforeEach(() => {
  videoManagerSession.recordingTabId = null;
  videoManagerSession.currentRecordingId = null;
  videoManagerSession.currentCountdownSessionId = null;
});

it('writes countdown and recording identity through the setter facade', () => {
  setVideoRecordingCountdownSessionId('countdown-1');
  setVideoRecordingId('recording-1');
  setVideoRecordingTabId(17);

  expect(videoManagerSession.currentCountdownSessionId).toBe('countdown-1');
  expect(videoManagerSession.currentRecordingId).toBe('recording-1');
  expect(videoManagerSession.recordingTabId).toBe(17);
});
