import { REVIEW_CLICK_DEFAULT } from '../../../../features/video/project/action-feedback/validation';
import { resolveVideoProjectActionPresentations } from '../../../../features/video/project/action-presentation';
import { expect, it } from 'vitest';
import {
  createVideoProjectFromRecording,
  createEmptyVideoProject,
} from '../../../../features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../features/video/project/defaults';
import { historyMarkerTime, historyTimeBounds, getTimelineHistoryLayout } from './history-layout';

it('keeps three permanent semantic rows without trailing padding or conditional geometry', () => {
  const layout = getTimelineHistoryLayout(createEmptyVideoProject());
  expect(layout).toMatchObject({
    keyTop: 0,
    typingTop: 0,
    clickTop: 28,
    cursorTop: 56,
    height: 80,
  });
});

it('adds internal keyboard and cursor rows without overlapping click targets', () => {
  const project = createEmptyVideoProject();
  expect(getTimelineHistoryLayout(project).height).toBe(80);
  project.actionEvents = [
    {
      id: 'key',
      anchor: { kind: 'project', time: 1 },
      kind: 'KEY',
      label: 'Ctrl+K',
      data: {},
      point: null,
    },
  ];
  project.cursorTrack = createVideoProjectCursorTrack('embedded-fallback');
  const layout = getTimelineHistoryLayout(project, [], true);
  expect(layout.clickTop - layout.keyTop!).toBeGreaterThanOrEqual(28);
  expect(layout.cursorTop! - layout.keyTop!).toBeGreaterThanOrEqual(28);
  expect(layout.height).toBe(layout.cursorTop! + 24);
  expect(getTimelineHistoryLayout(project, [], false).cursorTop).toBe(56);
});

it('bounds click dragging by both retained footage and the common authored offset range', () => {
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
        id: 'click',
        kind: 'CLICK',
        time: 5,
        duration: 0.1,
        point: { x: 0.5, y: 0.5 },
        label: '',
        data: {},
        preset: 'NONE',
      },
    ],
  });
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'click', effect: 'ripple', before: 0.4, offset: 1.8 },
  ];
  const row = resolveVideoProjectActionPresentations(project)[0]!;
  expect(historyMarkerTime(row, project)).toBeCloseTo(6.4, 12);
  const bounds = historyTimeBounds(row, project);
  expect(bounds.minimumTime).toBeCloseTo(2.6, 12);
  expect(bounds.maximumTime).toBeCloseTo(6.6, 12);
  project.actionEvents[0]!.anchor = {
    kind: 'recording-source',
    recordingId: 'source',
    sourceInstanceId: project.actionFeedback![0]!.sourceInstanceId,
    sourceEventId: 'click',
    sourceTime: 0.1,
  };
  project.actionFeedback![0]!.gestureStyles![0]!.offset = 0;
  const clipped = resolveVideoProjectActionPresentations(project)[0]!;
  expect(historyMarkerTime(clipped, project)).toBe(0);
  expect(historyTimeBounds(clipped, project)).toEqual({ minimumTime: 0, maximumTime: 2 });
});
