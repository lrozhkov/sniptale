// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { VideoProjectClipType } from '../../../../features/video/project/types';
import {
  ProjectTimelineTelemetryLane,
  ProjectTimelineTelemetryLaneLabelRow,
} from './telemetry-lane';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('seeks to the source-mapped project time without mutating telemetry', () => {
  const project = createVideoProjectFromRecording({
    duration: 4,
    filename: 'telemetry.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'recording-1',
    size: 100,
    width: 1280,
  });
  const sourceClip = project.clips.find((clip) => clip.type === VideoProjectClipType.VIDEO)!;
  sourceClip.duration = 2;
  sourceClip.playbackRate = 2;
  const telemetry = createTelemetry();
  const originalTelemetry = structuredClone(telemetry);
  const onSeek = vi.fn();
  const onParentClick = vi.fn();

  act(() => {
    root?.render(
      <div onClick={onParentClick}>
        <ProjectTimelineTelemetryLane
          onSeek={onSeek}
          pixelsPerSecond={100}
          project={project}
          recordingTelemetry={telemetry}
        />
      </div>
    );
  });

  const marker = container?.querySelector<HTMLButtonElement>('button[title="Captured click"]');
  expect(marker?.style.left).toBe('100px');
  act(() => marker?.click());
  expect(onSeek).toHaveBeenCalledWith(1);
  expect(onParentClick).not.toHaveBeenCalled();
  expect(telemetry).toEqual(originalTelemetry);
});

it('shows captured-source metadata only in the non-compact rail', () => {
  act(() => {
    root?.render(<ProjectTimelineTelemetryLaneLabelRow compactRows={false} />);
  });
  expect(container?.textContent).toContain('Снятые события');

  act(() => {
    root?.render(<ProjectTimelineTelemetryLaneLabelRow compactRows />);
  });
  expect(container?.textContent).not.toContain('Снятые события');
});

function createTelemetry(): RecordingTelemetryEntry {
  return {
    actionEvents: [
      {
        data: {},
        duration: 0,
        id: 'captured-click',
        kind: 'CLICK',
        label: 'Captured click',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 2,
      },
    ],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: null,
    recordingId: 'recording-1',
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}
