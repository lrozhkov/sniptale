import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion/index';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
} from '../../../features/video/project/types';
import { createGeneratedMotionPathFromTelemetry } from './telemetry';

it('builds generated motion path stops from recording cursor telemetry', () => {
  const project = createEmptyVideoProject('Telemetry path');
  const region = createVideoProjectMotionRegion(project, 0);
  const path = createGeneratedMotionPathFromTelemetry({
    project,
    region,
    telemetry: createTelemetry(),
  });

  expect(path.stops.length).toBeGreaterThan(1);
  expect(path.stops[0]?.target).toEqual(expect.objectContaining({ kind: 'POINT' }));
});

function createTelemetry(): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: CaptureMode.TAB,
    createdAt: 0,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.SEPARATE,
      samples: [
        { id: 'a', time: 0, visible: true, x: 20, y: 20 },
        { id: 'b', time: 1, visible: true, x: 260, y: 180 },
      ],
      skin: {
        animationPreset: VideoCursorAnimationPreset.NONE,
        color: '#ffffff',
        hidden: false,
        preset: VideoCursorVisualPreset.ARROW,
        scale: 1,
        shadow: false,
      },
    },
    recordingId: 'recording',
    signals: [],
    updatedAt: 0,
    viewport: {
      devicePixelRatio: 1,
      height: 720,
      outerHeight: 720,
      outerWidth: 1280,
      scrollX: 0,
      scrollY: 0,
      viewportOffsetX: 0,
      viewportOffsetY: 0,
      width: 1280,
    },
  };
}
