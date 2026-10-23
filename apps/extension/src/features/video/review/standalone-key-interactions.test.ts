import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { parseHydratableVideoProject } from '../project/validation/root';
import { patchReviewKeys } from '../project/action-feedback/key-animation';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import { applyRecordingReviewInteractions } from './standalone-interactions';

it('hands off the complete accepted key caption without changing capture facts and reopens it', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 4,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 1,
        duration: 0.2,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  const facts = structuredClone(project.actionEvents);
  const content = createQuickEditAdvancedContent();
  content.keyAnimations = patchReviewKeys([], ['key'], {
    enabled: true,
    before: 0.2,
    after: 2,
    offset: -0.1,
    style: {
      position: 'top-right',
      fontFamily: 'monospace',
      fontSize: 36,
      color: '#12345680',
      background: '#abcdef90',
      opacity: 0.7,
      cornerRadius: 12,
      margin: 42,
      entrance: 'slide',
    },
  });
  const result = applyRecordingReviewInteractions(project, 'recording', content);
  expect(result.actionFeedback?.[0]).toMatchObject({ keyStyles: content.keyAnimations });
  expect(result.actionEvents).toEqual(facts);
  const restored = parseHydratableVideoProject(JSON.parse(JSON.stringify(result)));
  expect(restored?.actionFeedback?.[0]).toMatchObject({ keyStyles: content.keyAnimations });
  expect(project.actionFeedback?.[0]).not.toHaveProperty('keyStyles');
});

it('preserves optional key absence and replaces an explicit empty style list only for its source', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 4,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 1,
        duration: 0.2,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], { enabled: true });
  project.actionFeedback!.push({
    ...structuredClone(project.actionFeedback![0]!),
    sourceInstanceId: 'other',
  });
  const before = structuredClone(project);
  const absent = createQuickEditAdvancedContent();
  expect(applyRecordingReviewInteractions(project, 'recording', absent)).toBe(project);
  absent.actionsEnabled = true;
  const retained = applyRecordingReviewInteractions(project, 'recording', absent);
  expect(
    retained.actionFeedback?.find(
      (group) => group.sourceInstanceId === before.actionFeedback![0]!.sourceInstanceId
    )?.keyStyles
  ).toEqual(before.actionFeedback![0]!.keyStyles);
  absent.keyAnimations = [];
  const cleared = applyRecordingReviewInteractions(project, 'recording', absent);
  expect(
    cleared.actionFeedback?.find(
      (group) => group.sourceInstanceId === before.actionFeedback![0]!.sourceInstanceId
    )?.keyStyles
  ).toEqual([]);
  expect(cleared.actionFeedback?.find((group) => group.sourceInstanceId === 'other')).toEqual(
    before.actionFeedback![1]
  );
  expect(project).toEqual(before);
});
