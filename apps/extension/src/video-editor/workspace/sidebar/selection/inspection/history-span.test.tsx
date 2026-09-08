// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../../features/video/project/timeline/project-meta.test.helpers';
import type { RecordingTelemetryEntry } from '../../../../../composition/persistence/recordings/contracts';
import { ProjectTimelineTelemetryLane } from '../../../../timeline/project/effect-lanes/telemetry-lane';
import type { VideoEditorTypingCompressionResult } from '../../../../contracts/commands/timeline';
import { InspectHistorySpanPanel } from './history-span';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => (key === 'videoEditor.sidebar.typingSeconds' ? 's' : key),
  useAppLocale: () => 'en',
}));
vi.mock('../shared/controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/controls')>()),
  SelectInput: (props: {
    label: string;
    value: string;
    disabled: boolean;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const target = {
  recordingId: 'rec-asset-video',
  sourceInstanceId: 'instance',
  signalId: 'typing',
  clipId: 'clip-video',
};
function fixture() {
  const project = createProject([createVideoClip({ sourceInstanceId: 'instance', startTime: 10 })]);
  project.duration = 18;
  const telemetry: RecordingTelemetryEntry = {
    recordingId: target.recordingId,
    createdAt: 1,
    updatedAt: 1,
    captureMode: 'TAB',
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [
      { id: 'typing', kind: 'typing', startTime: 2, endTime: 6, point: null, data: { count: 8 } },
    ],
  };
  return {
    project,
    typingProject: project,
    recordingTelemetry: [telemetry],
    target,
    onApplyTypingCompression: vi.fn((): VideoEditorTypingCompressionResult => ({
      status: 'applied',
      clipId: 'middle',
    })),
  };
}
function button(key: string) {
  const result = [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(key)
  );
  if (!result) throw new Error(`Missing ${key}`);
  return result;
}
function click(key: string) {
  act(() => button(key).click());
}
function choose(rate: string) {
  act(() => {
    const select = container.querySelector('select')!;
    select.value = rate;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('previews exact duration without mutation and applies the raw snapshot once', () => {
  const props = fixture();
  const before = structuredClone(props.project);
  act(() =>
    root.render(
      <InspectHistorySpanPanel {...props} project={{ ...props.project, backgroundColor: '#fff' }} />
    )
  );
  click('typingPreview');
  expect(container.textContent).toContain('typingUnchanged');
  expect(button('typingApply').disabled).toBe(true);
  choose('2');
  click('typingPreview');
  expect(container.textContent).toContain('4.00 s → 2.00 s');
  expect(props.onApplyTypingCompression).not.toHaveBeenCalled();
  expect(props.project).toEqual(before);
  click('typingApply');
  expect(props.onApplyTypingCompression).toHaveBeenCalledExactlyOnceWith(
    { ...target, targetPlaybackRate: 2 },
    props.typingProject
  );
});
it('requires recomputation after the raw project snapshot changes', () => {
  const props = fixture();
  act(() => root.render(<InspectHistorySpanPanel {...props} />));
  choose('2');
  click('typingPreview');
  const current = { ...props.project, name: 'Changed' };
  act(() =>
    root.render(<InspectHistorySpanPanel {...props} project={current} typingProject={current} />)
  );
  expect(container.textContent).toContain('typingStale');
  expect(button('typingApply').disabled).toBe(true);
  click('typingApply');
  expect(props.onApplyTypingCompression).not.toHaveBeenCalled();
  click('typingPreview');
  click('typingApply');
  expect(props.onApplyTypingCompression).toHaveBeenCalledExactlyOnceWith(
    { ...target, targetPlaybackRate: 2 },
    current
  );
});
it('does not offer a fake preview for missing telemetry or locked source tracks', () => {
  const props = fixture();
  act(() => root.render(<InspectHistorySpanPanel {...props} recordingTelemetry={[]} />));
  expect(button('typingPreview').disabled).toBe(true);
  expect(button('typingApply').disabled).toBe(true);
  props.project.tracks.find((track) => track.id === 'track-video')!.locked = true;
  act(() => root.render(<InspectHistorySpanPanel {...props} />));
  expect(container.textContent).toContain('typingLocked');
  expect(button('typingApply').disabled).toBe(true);
  expect(props.onApplyTypingCompression).not.toHaveBeenCalled();
});

it('selects the exact repeated typing span and seeks its visible start without duplicate action markers', () => {
  const props = fixture();
  props.project.clips.push(
    createVideoClip({ id: 'repeat', sourceInstanceId: 'instance', startTime: 22 })
  );
  props.project.duration = 30;
  const select = vi.fn();
  const seek = vi.fn();
  act(() =>
    root.render(
      <ProjectTimelineTelemetryLane
        project={props.project}
        recordingTelemetry={props.recordingTelemetry}
        pixelsPerSecond={20}
        onSeek={seek}
        onSelectHistorySpan={select}
      />
    )
  );
  const spans = container.querySelectorAll<HTMLButtonElement>('[data-history-span-kind="typing"]');
  expect(spans).toHaveLength(2);
  expect(container.querySelectorAll('[data-action-id]')).toHaveLength(0);
  const repeated = container.querySelector<HTMLButtonElement>('[data-history-clip-id="repeat"]')!;
  act(() => repeated.click());
  expect(select).toHaveBeenCalledExactlyOnceWith({ ...target, clipId: 'repeat' });
  expect(seek).toHaveBeenCalledExactlyOnceWith(24);
});

it('disables applying a snapshot rejected as stale by the authoritative command', () => {
  const props = fixture();
  props.onApplyTypingCompression.mockReturnValueOnce({ status: 'stale' });
  act(() => root.render(<InspectHistorySpanPanel {...props} />));
  choose('2');
  click('typingPreview');
  click('typingApply');
  expect(container.textContent).toContain('typingStale');
  expect(button('typingApply').disabled).toBe(true);
  click('typingPreview');
  expect(button('typingApply').disabled).toBe(false);
});
