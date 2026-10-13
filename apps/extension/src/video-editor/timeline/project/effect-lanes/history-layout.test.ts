import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../features/video/project/defaults';
import { getTimelineHistoryLayout } from './history-layout';

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
