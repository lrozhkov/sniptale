import { expect, it } from 'vitest';
import { patchReviewKeys } from '../../../../features/video/project/action-feedback/key-animation';
import { resolveVideoProjectActionPresentations } from '../../../../features/video/project/action-presentation';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { historyMarkerTime, historyTimeBounds, observedKeyboardInterval } from './history-layout';

it('uses the authored caption window for key marker movement while retaining the observed keyboard interval', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 5,
        duration: 1,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: { keyboardOnsetTime: 5, downTime: 5, upTime: 6 },
      },
    ],
  });
  project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
    enabled: true,
    before: 0.4,
    after: 1,
    offset: 1.8,
  });
  const row = resolveVideoProjectActionPresentations(project)[0]!;
  expect(historyMarkerTime(row, project)).toBeCloseTo(6.4, 10);
  expect(historyTimeBounds(row, project)).toEqual({
    minimumTime: expect.closeTo(2.6, 10),
    maximumTime: expect.closeTo(6.6, 10),
  });
  expect(observedKeyboardInterval(row.event)).toEqual({ start: 5, end: 6 });
  project.actionFeedback![0]!.keyStyles![0]!.before = 2;
  project.actionFeedback![0]!.keyStyles![0]!.offset = -2;
  if (project.actionEvents[0]!.anchor.kind !== 'recording-source')
    throw new Error('Missing anchor.');
  project.actionEvents[0]!.anchor.sourceTime = 0.1;
  const clipped = resolveVideoProjectActionPresentations(project)[0]!;
  expect(historyMarkerTime(clipped, project)).toBe(0);
  expect(historyTimeBounds(clipped, project).minimumTime).toBe(0);
});
