// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { useResolvedEffectSelection } from './selection';

it.each([true, false])(
  'keeps zoom selection independent of lane visibility (%s), clearing it for other objects',
  (visible) => {
    const project = createEmptyVideoProject();
    project.duration = 8;
    project.utilityLanes = {
      camera: { visible, locked: false },
      actions: { visible: true, locked: false },
    };
    const region = createVideoProjectMotionRegion(project, 0);
    project.motionRegions = [region];
    let resolved: ReturnType<typeof useResolvedEffectSelection>;
    function Probe({ selection }: { selection: VideoEditorSelection }) {
      resolved = useResolvedEffectSelection(project, selection);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    const zoom: VideoEditorSelection = { kind: 'motion-region', motionRegionId: region.id };
    const alternatives: VideoEditorSelection[] = [
      { kind: 'motion-connection', motionRegionId: region.id },
      { kind: 'scene' },
      { kind: 'track', trackId: project.tracks[0]!.id },
    ];
    try {
      for (const selection of alternatives) {
        act(() => root.render(<Probe selection={zoom} />));
        act(() => resolved.setOptimisticSelection({ kind: 'motion', segmentId: region.id }));
        expect(resolved!.selectedEffectSelection?.segmentId).toBe(region.id);
        act(() => root.render(<Probe selection={selection} />));
        expect(resolved!.selectedEffectSelection).toBeNull();
        act(() => root.render(<Probe selection={zoom} />));
        expect(resolved!.selectedEffectSelection?.segmentId).toBe(region.id);
      }
    } finally {
      act(() => root.unmount());
    }
  }
);
