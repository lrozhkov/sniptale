// @vitest-environment jsdom

import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import {
  createProject,
  createTrack,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { ProjectTimelineCursorLane } from './cursor-lane';
import type { VideoProjectActionEvent } from '../../../../features/video/project/types';
import { ProjectTimelineTelemetryLane } from './telemetry-lane';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function action(id: string, time: number): VideoProjectActionEvent {
  return {
    id,
    kind: 'CLICK',
    presentation: { preset: 'CLICK_RIPPLE', duration: 1 },
    anchor: { kind: 'project', time },
    label: id,
    point: { x: 10, y: 20 },
    data: {},
  };
}
it('separates simultaneous click and keyboard markers into internal rows', () => {
  const project = createEmptyVideoProject();
  project.duration = 5;
  project.actionEvents = [
    action('click', 1),
    { ...action('key', 1), kind: 'KEY', label: 'Ctrl+K' },
  ];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const click = container.querySelector<HTMLElement>('[data-action-id="click"]');
  const key = container.querySelector<HTMLElement>('[data-action-id="key"]');
  expect(click).not.toBeNull();
  expect(key).not.toBeNull();
  expect(
    Number.parseFloat(click!.style.top) - Number.parseFloat(key!.style.top)
  ).toBeGreaterThanOrEqual(28);
});

it.each([
  [{ gestureType: 'hold', downTime: 1, upTime: 3 }, 'CLICK', /Mouse hold|Удержание кнопки мыши/],
  [{ eventType: 'wheel' }, 'SCROLL', /Mouse wheel|Колесо мыши/],
] as const)(
  'names the observed mouse fact independently of its generic capture kind (%s)',
  (data, kind, label) => {
    const project = createEmptyVideoProject();
    project.duration = 10;
    project.actionEvents = [{ ...action('fact', 1), kind, label: 'Captured target', data }];
    act(() =>
      root.render(
        <ProjectTimelineTelemetryLane
          project={project}
          recordingTelemetry={[]}
          pixelsPerSecond={100}
          onSeek={vi.fn()}
        />
      )
    );
    expect(container.querySelector<HTMLButtonElement>('[data-action-id="fact"]')!.title).toMatch(
      label
    );
  }
);

it('names a metadata-only keyboard hold in the keyboard row', () => {
  const { project, telemetry } = overlappingTypingFixture();
  telemetry.signals = [
    {
      id: 'held',
      kind: 'typing',
      startTime: 1,
      endTime: 4,
      point: null,
      data: { keyboardHold: true, activity: 'keyboard', eventType: 'held-key', captureSegment: 1 },
    },
  ];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[telemetry]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const held = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.history-span-cluster"] button'
  )!;
  act(() => held.click());
  expect(document.querySelector('[role=option]')!.textContent).toMatch(
    /Held key|Удержание клавиши/
  );
});

it('keeps empty keyboard capture scope accessible without adding row height', () => {
  const project = createEmptyVideoProject();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const row = container.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.history-row"]'
  )!;
  expect(row.style.height).toBe('80px');
  const keyboard = row.querySelector('[data-history-family=keyboard]')!;
  expect(keyboard.getAttribute('title')).toMatch(/recorded page|записываемой странице/);
  expect(document.getElementById(keyboard.getAttribute('aria-describedby')!)?.textContent).toBe(
    keyboard.getAttribute('title')
  );
});

it.each([
  [3, 100],
  [4, 200],
])(
  'keeps the retained observed hold tail through source endpoint %s selectable after down is cut',
  (upTime, width) => {
    const project = createProject([
      createVideoClip({
        id: 'retained',
        sourceInstanceId: 'instance',
        sourceStart: 2,
        sourceDuration: 2,
        duration: 2,
        startTime: 0,
      }),
    ]);
    project.actionEvents = [
      {
        ...action('cut-hold', 1),
        presentation: { duration: 0.2, offset: 0.5 },
        data: { gestureType: 'hold', downTime: 1, upTime },
        anchor: {
          kind: 'recording-source',
          recordingId: 'rec-asset-video',
          sourceInstanceId: 'instance',
          sourceEventId: 'raw-hold',
          sourceTime: 1,
        },
      },
    ];
    const select = vi.fn();
    act(() =>
      root.render(
        <ProjectTimelineTelemetryLane
          project={project}
          recordingTelemetry={[]}
          pixelsPerSecond={100}
          onSeek={vi.fn()}
          onSelectActionOccurrence={select}
        />
      )
    );
    const held = container.querySelector<HTMLButtonElement>('[data-action-id="cut-hold"]');
    expect(held).not.toBeNull();
    expect(held!.style.width).toBe(`${width}px`);
    act(() => held!.click());
    expect(select).toHaveBeenCalledWith('cut-hold', 'retained');
    expect(project.actionEvents[0]!.anchor).toMatchObject({ sourceTime: 1 });
  }
);

it('maps an observed hold across a source rate boundary independently of authored timing', () => {
  const project = createProject([
    createVideoClip({
      id: 'first',
      sourceInstanceId: 'instance',
      sourceStart: 0,
      sourceDuration: 1,
      duration: 1,
      startTime: 0,
    }),
    createVideoClip({
      id: 'fast',
      sourceInstanceId: 'instance',
      sourceStart: 1,
      sourceDuration: 2,
      duration: 1,
      startTime: 1,
      playbackRate: 2,
    }),
  ]);
  project.actionEvents = [
    {
      ...action('rate-hold', 0.5),
      presentation: { offset: 0.4, duration: 0.3 },
      data: { gestureType: 'hold', downTime: 0.5, upTime: 2 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw-hold',
        sourceTime: 0.5,
      },
    },
  ];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const held = container.querySelector<HTMLButtonElement>('[data-action-id="rate-hold"]')!;
  expect(held.style.width).toBe('100px');
  expect(held.style.left).toBe('50px');
});

it('keeps the observed right mouse button in its history hint', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [{ ...action('right', 1), data: { button: 2 } }];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  expect(container.querySelector<HTMLButtonElement>('[data-action-id="right"]')!.title).toMatch(
    /Right button|Правая кнопка/
  );
});

it('keeps the outer history boundary without separators between its three semantic rows', () => {
  const project = createEmptyVideoProject();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
        cursorRow={
          <ProjectTimelineCursorLane
            embedded
            project={project}
            pixelsPerSecond={100}
            selectedEffectSelection={null}
            onBeginEffectInteraction={vi.fn()}
          />
        }
      />
    )
  );
  const row = container.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.history-row"]'
  )!;
  expect(row.style.height).toBe('80px');
  expect(row.classList.contains('border-b')).toBe(true);
  expect(
    [...row.querySelectorAll('[data-history-family]')].every(
      (frame) => !frame.classList.contains('border-b')
    )
  ).toBe(true);
  expect(
    row
      .querySelector('[data-ui="video-editor.timeline.history-cursor-row"]')!
      .classList.contains('border-t')
  ).toBe(false);
});

it('names an unresolved observed down prefix without inventing a hold label', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [
    { ...action('prefix', 1), data: { gestureType: 'click', completion: 'lost', downTime: 1 } },
  ];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const prefix = container.querySelector<HTMLButtonElement>('[data-action-id="prefix"]')!;
  expect(prefix.title).toMatch(/Incomplete press|Незавершённое нажатие/);
  expect(prefix.title).not.toMatch(/Mouse hold|Удержание кнопки мыши/);
});

it('draws command holds and modifier combinations at their observed interval independently of authored timing', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [
    {
      ...action('held-command', 1),
      kind: 'KEY',
      label: 'Ctrl+K',
      presentation: { offset: 0.4, duration: 0.2 },
      data: { keyboardOnsetTime: 1, upTime: 2, pressDuration: 1 },
    },
    {
      ...action('modifiers', 3),
      kind: 'KEY',
      label: 'Alt+Shift',
      data: { modifierOnly: true, keyboardOnsetTime: 3, upTime: 4 },
    },
  ];
  const before = structuredClone(project.actionEvents);
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const hold = container.querySelector<HTMLButtonElement>('[data-action-id="held-command"]')!;
  expect(hold.title).toMatch(/Held key|Удержание клавиши/);
  expect(hold.style.left).toBe('100px');
  expect(hold.style.width).toBe('100px');
  const modifiers = container.querySelector<HTMLButtonElement>('[data-action-id="modifiers"]')!;
  expect(modifiers.title).toMatch(/Modifier combination|Сочетание модификаторов/);
  expect(modifiers.style.width).toBe('100px');
  expect(project.actionEvents).toEqual(before);
});

it.each([5, 31])('names additional delivered button %s in the standalone history', (button) => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [{ ...action('extra', 1), data: { button } }];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        onSeek={vi.fn()}
      />
    )
  );
  const title = container.querySelector<HTMLButtonElement>('[data-action-id="extra"]')!.title;
  expect(title).toMatch(/(?:Mouse button|Кнопка мыши) /);
  expect(title).toContain(` ${button + 1}`);
  expect(title).not.toMatch(/Forward button|Кнопка мыши «Вперёд»/);
});

function overlappingTypingFixture() {
  const project = createProject([
    createVideoClip({
      id: 'typing-a',
      name: 'Repeated screen',
      trackId: 'typing-track-a',
      sourceInstanceId: 'instance-a',
    }),
    createVideoClip({
      id: 'typing-b',
      name: 'Repeated screen',
      trackId: 'typing-track-b',
      sourceInstanceId: 'instance-b',
    }),
  ]);
  project.tracks = [createTrack('typing-track-a', 1), createTrack('typing-track-b', 2)];
  project.tracks[0]!.name = 'Screen A';
  project.tracks[1]!.name = 'Screen B';
  const telemetry: RecordingTelemetryEntry = {
    recordingId: 'rec-asset-video',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [
      { id: 'typing', kind: 'typing', startTime: 1, endTime: 4, point: null, data: {} },
      { id: 'idle', kind: 'cursor-idle', startTime: 0, endTime: 5, point: null, data: {} },
      { id: 'static', kind: 'static-frame', startTime: 0, endTime: 5, point: null, data: {} },
    ],
  };
  return { project, telemetry };
}
