import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';

const { inspectPanelMock } = vi.hoisted(() => ({
  inspectPanelMock: vi.fn(() => (
    <div className="overflow-x-hidden overflow-y-auto">
      <div className="space-y-3" />
    </div>
  )),
}));

vi.mock('../inspect', () => ({
  WorkspaceSidebarInspectPanel: inspectPanelMock,
}));

import { WorkspaceSidebarSelectionBody } from './body';

function createProps() {
  return {
    project: createEmptyVideoProject('Selection body'),
    selectedClip: null,
    selectedTrack: null,
    onSetSceneBackground: vi.fn(),
    onResizeProject: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onAddActionEvent: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
  } as const;
}

describe('workspace-sidebar/selection/body', () => {
  it('renders the inspector body as a vertical scroll owner with horizontal clipping', () => {
    const markup = renderToStaticMarkup(<WorkspaceSidebarSelectionBody {...createProps()} />);

    expect(markup).toContain('overflow-x-hidden');
    expect(markup).toContain('overflow-y-auto');
    expect(markup).toContain('space-y-3');
  });

  it('forwards track and media fit handlers to the inspector seam', () => {
    const props = {
      ...createProps(),
      onApplyMediaClipVisualsToTrack: vi.fn(),
      onConvertTextClipToAnnotation: vi.fn(),
      onRenameTrack: vi.fn(),
      onUpdateMediaClipFitScalePercent: vi.fn(),
      onUpdateMediaClipShadowIntensity: vi.fn(),
      onUpdateSubtitleTrackStyle: vi.fn(),
    };

    renderToStaticMarkup(<WorkspaceSidebarSelectionBody {...props} />);

    expect(inspectPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack,
        onConvertTextClipToAnnotation: props.onConvertTextClipToAnnotation,
        onRenameTrack: props.onRenameTrack,
        onUpdateMediaClipFitScalePercent: props.onUpdateMediaClipFitScalePercent,
        onUpdateMediaClipShadowIntensity: props.onUpdateMediaClipShadowIntensity,
        onUpdateSubtitleTrackStyle: props.onUpdateSubtitleTrackStyle,
      }),
      undefined
    );
  });
});
