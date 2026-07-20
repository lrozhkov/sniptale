import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { WorkspaceSidebarSelectionPanelProps } from '../contracts/selection-panel';

vi.mock('./inspection/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inspection/helpers')>()),
  SelectionEmptyState: () => <div data-panel="empty" />,
}));
vi.mock('./inspection/cursor', () => ({
  InspectCursorPanel: () => <div data-panel="cursor" />,
}));
vi.mock('./inspection/effects', () => ({
  InspectActionPanel: () => <div data-panel="action" />,
  InspectTransitionPanel: () => <div data-panel="transition" />,
}));
vi.mock('./inspection/clip', () => ({
  InspectClipPanel: () => <div data-panel="clip" />,
}));
vi.mock('./inspection/motion', () => ({
  InspectMotionPanel: () => <div data-panel="motion" />,
}));
vi.mock('./inspection/object-track', () => ({
  InspectObjectTrackPanel: () => <div data-panel="object-track" />,
}));
vi.mock('./inspection/scene', () => ({
  InspectScenePanel: () => <div data-panel="scene" />,
}));
vi.mock('./inspection/track', () => ({
  InspectTrackPanel: () => <div data-panel="track" />,
}));

import { WorkspaceSidebarInspectPanel } from './inspect';

const selectedDefaults = {
  selectedActionEvent: null,
  selectedClip: null,
  selectedCursorSample: null,
  selectedMotionRegion: null,
  selectedObjectTrack: null,
  selectedTrack: null,
  selectedTransition: null,
};

function renderSelection(
  selection: WorkspaceSidebarSelectionPanelProps['selection'],
  selected: Readonly<Record<string, unknown>> = {}
): string {
  const props = {
    ...selectedDefaults,
    ...selected,
    selection,
  } as WorkspaceSidebarSelectionPanelProps;

  return renderToStaticMarkup(<WorkspaceSidebarInspectPanel {...props} />);
}

describe('workspace sidebar selection routing', () => {
  it.each([
    [{ kind: VideoEditorSelectionKind.SCENE }, {}, 'scene'],
    [{ kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' }, { selectedClip: {} }, 'clip'],
    [{ kind: VideoEditorSelectionKind.TRACK, trackId: 'track-1' }, { selectedTrack: {} }, 'track'],
    [
      { kind: VideoEditorSelectionKind.TRANSITION_JUNCTION, transitionId: 'transition-1' },
      { selectedTransition: {} },
      'transition',
    ],
    [
      { kind: VideoEditorSelectionKind.CURSOR_SEGMENT, sampleId: 'sample-1' },
      { selectedCursorSample: {} },
      'cursor',
    ],
    [
      { kind: VideoEditorSelectionKind.OBJECT_TRACK, objectTrackId: 'object-track-1' },
      { selectedObjectTrack: {} },
      'object-track',
    ],
    [
      { kind: VideoEditorSelectionKind.ACTION_SEGMENT, actionEventId: 'action-1' },
      { selectedActionEvent: {} },
      'action',
    ],
    [
      { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: 'motion-1' },
      { selectedMotionRegion: {} },
      'motion',
    ],
  ] as const)('routes %s selection to the %s panel', (selection, selected, panel) => {
    expect(renderSelection(selection, selected)).toContain(`data-panel="${panel}"`);
  });

  it('renders the empty state when a selected entity is stale or missing', () => {
    expect(
      renderSelection({ kind: VideoEditorSelectionKind.CLIP, clipId: 'stale-clip' })
    ).toContain('data-panel="empty"');
  });
});
