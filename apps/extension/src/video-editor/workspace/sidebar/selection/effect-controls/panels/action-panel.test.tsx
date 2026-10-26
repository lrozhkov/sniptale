// @vitest-environment jsdom
import { REVIEW_CLICK_DEFAULT } from '../../../../../../features/video/project/action-feedback/validation';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoProjectActionOccurrences } from '../../../../../../features/video/project/action-occurrences';
import { InspectActionPanel } from './action-panel';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function fixture() {
  const project = createProject([
    createVideoClip({ id: 'first', sourceInstanceId: 'instance' }),
    createVideoClip({ id: 'repeat', startTime: 10, sourceInstanceId: 'instance' }),
  ]);
  project.duration = 18;
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      capturedDuration: 0.1,
      point: { x: 0.2, y: 0.3 },
      data: {},
      label: 'Safe test button',
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw-click',
        sourceTime: 1,
      },
      presentation: { duration: 0.4 },
    },
  ];
  return {
    project,
    currentTime: 11,
    selectedActionOccurrence: resolveVideoProjectActionOccurrences(project).find(
      (row) => row.clipId === 'repeat'
    )!,
    placementMode: null,
    onUpdateActionEventDetails: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
  };
}
function button(suffix: string) {
  const key = `videoEditor.sidebar.${suffix}`;
  const result = [...container.querySelectorAll('button')].find(
    (node) =>
      node.textContent?.includes(key) ||
      node.getAttribute('aria-label') === key ||
      node.title === key
  );
  if (!result) throw new Error(`Missing ${key}`);
  return result;
}

it('resets inheritance for the selected occurrence without changing captured facts', () => {
  const props = fixture();
  const facts = structuredClone(props.project.actionEvents);
  act(() => root.render(<InspectActionPanel {...props} />));
  act(() => button('historyReset').click());
  expect(props.onUpdateActionEventDetails).toHaveBeenCalledExactlyOnceWith('click', {
    clipId: 'repeat',
    presentation: null,
  });
  expect(props.project.actionEvents).toEqual(facts);
});

it('uses source percentages and the exact clip when placing a captured point', () => {
  const props = fixture();
  act(() => root.render(<InspectActionPanel {...props} />));
  act(() => button('inspectorGroupPlacement').click());
  act(() => button('resetPointToCenter').click());
  expect(props.onUpdateActionEventDetails).toHaveBeenCalledExactlyOnceWith('click', {
    clipId: 'repeat',
    presentation: { duration: 0.4, point: { x: 0.5, y: 0.5 } },
  });
  expect(button('selectPointOnStage').disabled).toBe(false);
  act(() => button('selectPointOnStage').click());
  expect(props.onStartActionPointPlacement).toHaveBeenCalledExactlyOnceWith('click', 'repeat');
  act(() => root.render(<InspectActionPanel {...props} currentTime={0} />));
  expect(button('selectPointOnStage').disabled).toBe(true);
});

it('respects a locked history lane for both inheritance and point editing', () => {
  const props = fixture();
  props.project.utilityLanes = {
    actions: { visible: true, locked: true },
    camera: { visible: true, locked: false },
  };
  act(() => root.render(<InspectActionPanel {...props} />));
  expect(button('historyReset').disabled).toBe(true);
  act(() => button('historyReset').click());
  act(() => button('inspectorGroupPlacement').click());
  expect(button('resetPointToCenter').disabled).toBe(true);
  expect(button('selectPointOnStage').disabled).toBe(true);
  expect(props.onUpdateActionEventDetails).not.toHaveBeenCalled();
});

it('groups gesture appearance without legacy timing or placement and keeps event admission', () => {
  const props = fixture();
  const base = props.project.actionEvents[0]!;
  const project = {
    ...props.project,
    version: 3 as const,
    actionEvents: [
      {
        ...base,
        data: {
          gestureType: 'hold',
          gestureId: 'hold',
          button: 0,
          downTime: 1,
          upTime: 2,
          completion: 'released',
        },
        presentation: { enabled: false, preset: 'NONE' as const },
      },
    ],
    actionFeedback: [
      { recordingId: 'rec-asset-video', sourceInstanceId: 'instance', settings: [], signals: [] },
    ],
  };
  const selected = resolveVideoProjectActionOccurrences(project).find(
    (row) => row.clipId === 'repeat'
  )!;
  act(() =>
    root.render(
      <InspectActionPanel {...props} project={project} selectedActionOccurrence={selected} />
    )
  );
  expect(button('historyForceOff').getAttribute('aria-pressed')).toBe('true');
  const labels = [...container.querySelectorAll('button')].map((node) =>
    node.getAttribute('aria-label')
  );
  expect(labels).not.toContain('videoEditor.sidebar.historyTransitions');
  expect(labels).not.toContain('videoEditor.sidebar.inspectorGroupPlacement');
  const style = container.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.clickAppearance"]'
  )!;
  expect(style).not.toBeNull();
  act(() => style.click());
  expect(
    container.querySelector('input[aria-label="gallery.videoReview.clickRadius"]')
  ).not.toBeNull();
  expect(container.querySelector('[aria-label="videoEditor.sidebar.actionSize"]')).toBeNull();
  expect(props.onUpdateActionEventDetails).not.toHaveBeenCalled();
});

it('groups ordinary source click controls with common timing and offsets and hides dormant sections', () => {
  const props = fixture();
  props.project.actionFeedback = [
    {
      recordingId: 'rec-asset-video',
      sourceInstanceId: 'instance',
      settings: [],
      signals: [],
      gestureStyles: [
        {
          id: 'raw-click',
          effect: 'magnify',
          color: '#123456ff',
          opacity: 1,
          radius: 40,
          stroke: 2,
          before: 0.2,
          after: 0.6,
          offset: 0.1,
          x: 0.1,
          y: 0,
          pulses: 1,
          easing: 'linear',
          magnification: 2,
        },
      ],
    },
  ];
  const render = () => act(() => root.render(<InspectActionPanel {...props} />));
  render();
  expect(container.querySelector('[aria-label="gallery.videoReview.clickEffect"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="videoEditor.sidebar.actionPreset"]')).toBeNull();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('nav [aria-label="gallery.videoReview.clickTiming"]')!
      .click()
  );
  expect(container.querySelector('[aria-label="gallery.videoReview.clickBefore"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="videoEditor.sidebar.actionDuration"]')).toBeNull();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('nav [aria-label="gallery.videoReview.clickPosition"]')!
      .click()
  );
  expect(container.querySelector('[aria-label="gallery.videoReview.clickX"]')).not.toBeNull();
  expect(button('selectPointOnStage').disabled).toBe(false);
  props.project.actionFeedback[0]!.gestureStyles![0]!.effect = 'off';
  render();
  expect(container.querySelector('nav [aria-label="gallery.videoReview.clickTiming"]')).toBeNull();
  expect(props.project.actionFeedback[0]!.gestureStyles![0]!.magnification).toBe(2);
});

it('disables source position commands when the capture has no point', () => {
  const props = fixture();
  props.project.actionEvents[0]!.point = null;
  props.project.actionFeedback = [
    {
      recordingId: 'rec-asset-video',
      sourceInstanceId: 'instance',
      settings: [],
      signals: [],
      gestureStyles: [{ ...REVIEW_CLICK_DEFAULT, id: 'raw-click', effect: 'press' }],
    },
  ];
  act(() => root.render(<InspectActionPanel {...props} />));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('nav [aria-label="gallery.videoReview.clickPosition"]')!
      .click()
  );
  expect(button('selectPointOnStage').disabled).toBe(true);
  expect(button('resetPointToCenter').disabled).toBe(true);
  expect(
    container
      .querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.clickX"]')!
      .matches(':disabled')
  ).toBe(true);
  act(() => button('selectPointOnStage').click());
  expect(props.onStartActionPointPlacement).not.toHaveBeenCalled();
  expect(props.project.actionEvents[0]!.point).toBeNull();
});
