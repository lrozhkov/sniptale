import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import type { WorkspaceSidebarSelectionPanelSourceProps } from '../contracts/selection-panel';
import { createSelectionPanelProps } from './selection-panel';

it('creates the selection panel contract without cursor-detection workflow props', () => {
  const project = createEmptyVideoProject('Selection panel');
  const props = createSelectionPanelProps({
    project,
    selectedClip: null,
    selectedTrack: project.tracks[0] ?? null,
  } as WorkspaceSidebarSelectionPanelSourceProps);

  expect(props).not.toHaveProperty('cursorDetection');
  expect(props.selection).toEqual({ kind: 'scene' });
  expect(props.onEnableCursorTrack).toBeTypeOf('function');
});
