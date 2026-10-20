// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { createTimelineProjection } from '../interaction-state/projection';
import { ProjectTimelineCanvasChrome } from './chrome';
import type { VideoProject } from '../../../../features/video/project/types/model';
import type { VideoEditorSelection } from '../../../contracts/selection';

vi.mock('../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture() {
  return createVideoProjectFromRecording({
    recordingId: 'notes',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
  });
}
function mount(project: VideoProject, selection?: VideoEditorSelection, startTime = 0) {
  const select = vi.fn();
  const range = vi.fn();
  const projection = createTimelineProjection({
    extentSeconds: project.duration,
    pixelsPerSecond: 100,
    viewportWidth: 500,
    startTime,
  });
  act(() =>
    root.render(
      <ProjectTimelineCanvasChrome
        project={project}
        selection={selection}
        projection={projection}
        playheadHandle={null}
        playbackRange={null}
        pixelsPerSecond={100}
        rulerMarkers={[]}
        onBeginRangeSelection={range}
        onSelectComment={select}
      />
    )
  );
  return { select, range };
}
function markers() {
  return [
    ...host.querySelectorAll<HTMLButtonElement>('[data-ui="video-editor.timeline.note-marker"]'),
  ];
}

it('groups identical note anchors while retaining selection and isolates marker events from ruler seeking', () => {
  const project = fixture();
  project.commentDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      canvasComments: [],
      annotations: [
        { id: 'first', text: 'First note', anchor: { kind: 'point', time: 2 } },
        { id: 'second', text: 'Second note', anchor: { kind: 'point', time: 2 } },
        { id: 'range', text: 'Range note', anchor: { kind: 'range', start: 3, end: 4 } },
      ],
    },
  ];
  const before = structuredClone(project);
  const { select, range } = mount(project, {
    kind: 'comment',
    documentId: 'doc',
    commentId: 'second',
  });
  expect(markers()).toHaveLength(2);
  const point = markers()[0]!;
  expect(point.dataset['noteCount']).toBe('2');
  expect(Number.parseFloat(point.style.width)).toBeGreaterThanOrEqual(26);
  expect(point.getAttribute('aria-label')).toContain('First note · Second note');
  expect(point.getAttribute('aria-pressed')).toBe('true');
  act(() => {
    point.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    point.click();
  });
  expect(select).toHaveBeenCalledExactlyOnceWith('doc', 'first', 2);
  expect(range).not.toHaveBeenCalled();
  expect(project).toEqual(before);
});

it('projects notes across exact retained source pieces and never borrows an independent instance', () => {
  const project = fixture();
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const sourceInstanceId = clip.sourceInstanceId ?? clip.id;
  project.clips = [
    {
      ...clip,
      sourceInstanceId,
      id: 'first',
      startTime: 0,
      duration: 2,
      sourceStart: 0,
      sourceDuration: 2,
    },
    {
      ...clip,
      sourceInstanceId,
      id: 'second',
      startTime: 5,
      duration: 2,
      sourceStart: 4,
      sourceDuration: 2,
    },
    { ...clip, sourceInstanceId: 'other', id: 'independent', startTime: 0 },
  ];
  project.commentDocuments = [
    {
      id: 'doc',
      binding: { kind: 'source', assetId: clip.assetId, sourceInstanceId },
      canvasComments: [],
      annotations: [
        { id: 'range', text: 'Retained range', anchor: { kind: 'range', start: 1, end: 5 } },
        { id: 'gap', text: 'Dormant note', anchor: { kind: 'point', time: 3 } },
      ],
    },
  ];
  mount(project);
  expect(markers()).toHaveLength(2);
  expect(markers().map((marker) => marker.style.left)).toEqual(['100px', '500px']);
  expect(project.commentDocuments[0]!.annotations).toHaveLength(2);
});

it('bounds range geometry to the precise view and omits offscreen points', () => {
  const project = fixture();
  project.duration = 1000;
  project.commentDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      canvasComments: [],
      annotations: [
        { id: 'point', text: 'Offscreen', anchor: { kind: 'point', time: 2 } },
        { id: 'long', text: 'Long range', anchor: { kind: 'range', start: 0, end: 1000 } },
      ],
    },
  ];
  mount(project, undefined, 100);
  expect(markers()).toHaveLength(1);
  expect(Number.parseFloat(markers()[0]!.style.width)).toBeLessThanOrEqual(740.000001);
  expect(Number.parseFloat(markers()[0]!.style.left)).toBeGreaterThanOrEqual(-120.000001);
  expect(host.querySelector('canvas')).toBeNull();
});
