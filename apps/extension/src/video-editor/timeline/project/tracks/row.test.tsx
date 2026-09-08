// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoTrackKind } from '../../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { buildTimelineTrackLayoutModel } from './layout';
import { ProjectTimelineTrackRow } from './row';

const recordingMocks = vi.hoisted(() => ({ open: vi.fn(), project: vi.fn() }));
vi.mock('../../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/controller/composition/hooks')>()),
  useWorkspaceDialogsContext: () => ({ openTrackAudioRecordingDialog: recordingMocks.open }),
}));
vi.mock('../../../runtime/controller/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/controller/store')>()),
  getCurrentVideoEditorProjectSnapshot: recordingMocks.project,
  getCurrentVideoEditorCurrentTime: () => 7,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('retains focus on track state icon buttons after pointer activation', () => {
  const project = createEmptyVideoProject('Track row');
  const trackLayout = buildTimelineTrackLayoutModel({
    project,
    trackHeightByTrackId: {},
    tracks: project.tracks,
  }).layoutByTrackId.get(project.tracks[0]!.id);

  act(() => {
    root?.render(
      <ProjectTimelineTrackRow
        compactRows={false}
        isSelected={false}
        track={project.tracks[0]!}
        trackLabel="O1"
        trackLayout={trackLayout}
        onSelectTrack={vi.fn()}
        onToggleTrackLock={vi.fn()}
        onToggleTrackVisibility={vi.fn()}
      />
    );
  });

  const buttons = container?.querySelectorAll<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.icon-button"]'
  );
  const button = buttons?.[0];

  expect(buttons).toHaveLength(2);
  expect(buttons?.[0]?.className).toContain('--timeline-control-height');
  expect(buttons?.[0]?.getAttribute('data-active')).toBe('true');
  expect(buttons?.[1]?.getAttribute('data-active')).toBe('false');
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.track-select"]')?.textContent
  ).toContain('O1');

  button?.focus();
  expect(document.activeElement).toBe(button);

  act(() => {
    button?.click();
  });

  expect(document.activeElement).toBe(button);
});

it('keeps microphone entry out of track headers', () => {
  const project = createEmptyVideoProject('Voice');
  const track = project.tracks[0]!;
  recordingMocks.project.mockReturnValue(project);
  recordingMocks.open.mockClear();
  const render = () =>
    act(() => {
      root?.render(
        <ProjectTimelineTrackRow
          compactRows
          isSelected={false}
          track={track}
          trackLabel="A1"
          trackLayout={undefined}
          onSelectTrack={vi.fn()}
          onToggleTrackLock={vi.fn()}
          onToggleTrackVisibility={vi.fn()}
        />
      );
    });
  render();
  const button = () =>
    container!.querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.record-audio"]');
  expect(button()).toBeNull();
  track.kind = VideoTrackKind.AUDIO;
  render();
  expect(button()).toBeNull();
  expect(recordingMocks.open).not.toHaveBeenCalled();
});

it('uses speaker state for audio while retaining visibility eyes for video', () => {
  const project = createEmptyVideoProject('Track state');
  const track = project.tracks[0]!;
  const toggle = vi.fn();
  const render = () =>
    act(() =>
      root?.render(
        <ProjectTimelineTrackRow
          compactRows={false}
          isSelected={false}
          track={track}
          trackLabel="A1"
          trackLayout={undefined}
          onSelectTrack={vi.fn()}
          onToggleTrackLock={vi.fn()}
          onToggleTrackVisibility={toggle}
        />
      )
    );
  render();
  expect(container!.querySelector('.lucide-eye')).not.toBeNull();
  track.kind = VideoTrackKind.AUDIO;
  render();
  const speaker = container!.querySelector(
    '[data-ui="video-editor.timeline.icon-button"] .lucide-volume-2'
  );
  expect(speaker).not.toBeNull();
  expect(container!.querySelector('.lucide-eye')).toBeNull();
  act(() => speaker!.closest('button')!.click());
  expect(toggle).toHaveBeenCalledWith(track.id);
  track.visible = false;
  render();
  expect(container!.querySelector('.lucide-volume-x')).not.toBeNull();
  expect(
    container!.querySelector('.lucide-volume-x')!.closest('button')!.getAttribute('aria-pressed')
  ).toBe('false');
});
