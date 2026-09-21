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
import type { VideoProjectActionEvent } from '../../../../features/video/project/types';
import {
  ProjectTimelineTelemetryLane,
  ProjectTimelineTelemetryLaneLabelRow,
} from './telemetry-lane';

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
it('selects disabled events at authored presentation time while retaining captured time', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [
    { ...action('captured', 2), presentation: { enabled: false, offset: -0.5 } },
  ];
  const original = structuredClone(project);
  const select = vi.fn();
  const seek = vi.fn();
  const parent = vi.fn();
  act(() =>
    root.render(
      <div onClick={parent}>
        <ProjectTimelineTelemetryLane
          project={project}
          recordingTelemetry={[]}
          pixelsPerSecond={100}
          onSeek={seek}
          onSelectActionOccurrence={select}
        />
      </div>
    )
  );
  const marker = container.querySelector<HTMLButtonElement>('[data-action-id="captured"]')!;
  expect(marker.style.left).toBe('150px');
  expect(marker.disabled).toBe(false);
  expect(marker.dataset['historyStatus']).toBe('event-disabled');
  act(() => marker.click());
  expect(select).toHaveBeenCalledWith('captured', null);
  expect(seek).not.toHaveBeenCalled();
  expect(parent).not.toHaveBeenCalled();
  expect(project).toEqual(original);
});
it('offers each dense event through the shared keyboard-accessible popover', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = [
    action('a', 1),
    { ...action('b', 1), presentation: { enabled: false } },
    action('c', 1.1),
  ];
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={10}
        onSelectActionOccurrence={select}
        onSeek={seek}
      />
    )
  );
  const cluster = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.history-cluster"] button'
  )!;
  act(() =>
    cluster.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options).toHaveLength(3);
  expect(options.every((option) => !option.disabled)).toBe(true);
  act(() =>
    options[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(document.activeElement).toBe(options[1]);
  act(() => options[1]!.click());
  expect(select).toHaveBeenCalledWith('b', null);
  expect(seek).not.toHaveBeenCalled();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
it('selects the history header even when the project has no events', () => {
  const select = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLaneLabelRow
        project={createEmptyVideoProject()}
        compactRows={false}
        selected
        onSelect={select}
      />
    )
  );
  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.history-lane"]'
  )!;
  expect(button.getAttribute('aria-pressed')).toBe('true');
  act(() => button.click());
  expect(select).toHaveBeenCalledOnce();
});

it('history viewport targets: keeps a scrolled overscan cluster reachable without seeking', () => {
  const project = createEmptyVideoProject();
  project.duration = 30;
  project.actionEvents = Array.from({ length: 11 }, (_, index) => ({
    ...action(`dense-${index}`, 9 + index * 0.2),
    ...(index === 8 ? { presentation: { enabled: false } } : {}),
  }));
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        projection={historyViewport(10)}
        onSelectActionOccurrence={select}
        onSeek={seek}
      />
    )
  );

  const shell = container.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.history-cluster"]'
  );
  expect(shell).not.toBeNull();
  const anchor = historyTargetLeft(shell!);
  expect(anchor - 20).toBeGreaterThanOrEqual(0);
  expect(anchor + 20).toBeLessThanOrEqual(200);
  const trigger = shell!.querySelector<HTMLButtonElement>('button')!;
  act(() => trigger.click());
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (candidate) => candidate.textContent?.includes('dense-8')
  );
  expect(option).toBeDefined();
  expect(option!.disabled).toBe(false);
  act(() => option!.click());
  expect(select).toHaveBeenCalledWith('dense-8', null);
  expect(seek).not.toHaveBeenCalled();
});

it('history viewport targets: retains full hit areas at zero and right viewport edges', () => {
  const project = createEmptyVideoProject();
  project.duration = 30;
  project.actionEvents = [action('zero-edge', 0), action('right-edge', 2)];
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        projection={historyViewport(0)}
        onSelectActionOccurrence={select}
        onSeek={seek}
      />
    )
  );

  for (const event of project.actionEvents) {
    const marker = container.querySelector<HTMLButtonElement>(`[data-action-id="${event.id}"]`)!;
    expect(marker).not.toBeNull();
    const anchor = historyTargetLeft(marker);
    expect(anchor - 12).toBeGreaterThanOrEqual(0);
    expect(anchor + 12).toBeLessThanOrEqual(200);
    act(() => marker.click());
    expect(select).toHaveBeenLastCalledWith(event.id, null);
    expect(seek).not.toHaveBeenCalled();
  }
});

it('history viewport targets: does not bring an offscreen-only group into view', () => {
  const project = createEmptyVideoProject();
  project.duration = 30;
  project.actionEvents = [action('before-a', 9), action('before-b', 9.2), action('after', 12.8)];
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        projection={historyViewport(10)}
        onSeek={vi.fn()}
      />
    )
  );

  for (const target of container.querySelectorAll<HTMLElement>(
    '[data-ui="video-editor.timeline.history-event"], [data-ui="video-editor.timeline.history-cluster"]'
  )) {
    const anchor = historyTargetLeft(target);
    expect(anchor + 20 <= 0 || anchor - 20 >= 200).toBe(true);
  }
});

function historyViewport(startTime: number) {
  return {
    startTime,
    endTime: startTime + 2,
    pixelsPerSecond: 100,
    viewportWidth: 200,
    maxStartTime: 28,
    scrollWidth: 3000,
    scrollLeft: startTime * 100,
  };
}

function historyTargetLeft(element: HTMLElement): number {
  let current: HTMLElement | null = element;
  while (current && current !== container) {
    if (current.style.left) return Number.parseFloat(current.style.left);
    current = current.parentElement;
  }
  throw new Error('History target has no projected anchor');
}

it('shows a bounded cluster count and exposes selected membership without replacing the shared dropdown', () => {
  const project = createEmptyVideoProject();
  project.duration = 10;
  project.actionEvents = Array.from({ length: 101 }, (_, index) => action(`count-${index}`, 1));
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        projection={historyViewport(0)}
        onSelectActionOccurrence={select}
        onSeek={seek}
      />
    )
  );
  let trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.history-cluster"] button'
  )!;
  expect(trigger.textContent).toBe('99+');
  expect(trigger.getAttribute('aria-label')).toContain('101');
  expect(trigger.getAttribute('aria-pressed')).toBe('false');
  expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  expect(trigger.style.width).toBe('40px');
  expect(trigger.style.minHeight).toBe('24px');
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={100}
        projection={historyViewport(0)}
        selection={{ kind: 'action-occurrence', eventId: 'count-100', clipId: null }}
        onSelectActionOccurrence={select}
        onSeek={seek}
      />
    )
  );
  trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.history-cluster"] button'
  )!;
  expect(trigger.getAttribute('aria-pressed')).toBe('true');
  expect(trigger.textContent).toBe('99+');
  act(() =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options).toHaveLength(101);
  const lastEvent = options.find((option) => option.textContent?.includes('count-100'));
  expect(lastEvent).toBeDefined();
  act(() => lastEvent!.click());
  expect(select).toHaveBeenCalledWith('count-100', null);
  expect(seek).not.toHaveBeenCalled();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it('selects the exact repeated source appearance without seeking', () => {
  const project = createEmptyVideoProject();
  project.duration = 20;
  project.clips = [
    createVideoClip({ id: 'first', sourceInstanceId: 'instance', startTime: 0 }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'instance', startTime: 10 }),
  ];
  project.assets = createProject(project.clips).assets;
  project.tracks = createProject(project.clips).tracks;
  project.actionEvents = [
    {
      id: 'shared',
      kind: 'CLICK',
      label: 'Shared click',
      data: {},
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
    },
  ];
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[]}
        pixelsPerSecond={50}
        onSelectActionOccurrence={select}
        onSeek={seek}
      />
    )
  );
  const markers = [...container.querySelectorAll<HTMLButtonElement>('[data-action-id="shared"]')];
  expect(markers).toHaveLength(2);
  act(() => markers[1]!.click());
  expect(select).toHaveBeenCalledWith('shared', 'repeat');
  expect(seek).not.toHaveBeenCalled();
  expect(project.actionEvents).toHaveLength(1);
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

it.each(['pointer', 'keyboard'] as const)(
  'selects each same-time typing instance through the shared %s menu',
  (input) => {
    const { project, telemetry } = overlappingTypingFixture();
    const select = vi.fn();
    const seek = vi.fn();
    const original = structuredClone(project);
    act(() =>
      root.render(
        <ProjectTimelineTelemetryLane
          project={project}
          recordingTelemetry={[telemetry]}
          pixelsPerSecond={100}
          selection={{
            kind: 'history-span',
            recordingId: telemetry.recordingId,
            signalId: 'typing',
            sourceInstanceId: 'instance-b',
            clipId: 'typing-b',
          }}
          onSelectHistorySpan={select}
          onSeek={seek}
        />
      )
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-ui="video-editor.timeline.history-span-cluster"] button'
    );
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-pressed')).toBe('true');
    for (const [index, suffix] of ['a', 'b'].entries()) {
      act(() => {
        if (input === 'pointer') trigger!.click();
        else
          trigger!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
      expect(options).toHaveLength(2); // Read-only stable backgrounds are not menu targets.
      expect(options[0]!.textContent).toContain('Screen A');
      expect(options[1]!.textContent).toContain('Screen B');
      expect(options.every((option) => option.textContent?.includes('Repeated screen'))).toBe(true);
      if (input === 'keyboard') {
        if (index === 1)
          act(() =>
            options[0]!.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
            )
          );
        expect(document.activeElement).toBe(options[index]);
        const enter = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        });
        act(() => options[index]!.dispatchEvent(enter));
        expect(enter.defaultPrevented).toBe(false);
      }
      // ProductSelect uses native button activation for Enter. JSDOM dispatchEvent
      // omits that default click; the assembled native driver exercises real Enter.
      act(() => options[index]!.click());
      expect(select).toHaveBeenLastCalledWith({
        recordingId: telemetry.recordingId,
        sourceInstanceId: `instance-${suffix}`,
        signalId: 'typing',
        clipId: `typing-${suffix}`,
      });
      expect(seek).not.toHaveBeenCalled();
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    }
    expect(project).toEqual(original);
  }
);

it('keeps a lone typing span directly selectable despite overlapping stable backgrounds', () => {
  const { project, telemetry } = overlappingTypingFixture();
  project.clips = project.clips.slice(0, 1);
  telemetry.signals.find((signal) => signal.id === 'typing')!.data['targetName'] = 'Search project';
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={project}
        recordingTelemetry={[telemetry]}
        pixelsPerSecond={100}
        onSelectHistorySpan={select}
        onSeek={seek}
      />
    )
  );
  expect(
    container.querySelector('[data-ui="video-editor.timeline.history-span-cluster"]')
  ).toBeNull();
  const span = container.querySelector<HTMLButtonElement>(
    '[data-history-span-kind="typing"][data-history-clip-id="typing-a"]'
  )!;
  expect(span.title).toContain('Search project');
  act(() => span.click());
  expect(select).toHaveBeenCalledWith({
    recordingId: telemetry.recordingId,
    sourceInstanceId: 'instance-a',
    signalId: 'typing',
    clipId: 'typing-a',
  });
  expect(seek).not.toHaveBeenCalled();
});

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
    Number.parseFloat(key!.style.top) - Number.parseFloat(click!.style.top)
  ).toBeGreaterThanOrEqual(28);
});
