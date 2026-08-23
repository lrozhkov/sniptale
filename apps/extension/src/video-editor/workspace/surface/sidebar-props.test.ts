import { describe, expect, it } from 'vitest';
import { createFloatingWorkspaceController } from '../floating/top-panels.test-support';
import { getWorkspaceSidebarProps } from './sidebar-props';

describe('workspace/sidebar-props', () => {
  it('keeps active workspace sidebar handlers wired through the focused controller seam', () => {
    const controller = createFloatingWorkspaceController().sidebar;
    const props = getWorkspaceSidebarProps(controller);

    expect(props.onRenameTrack).toBe(controller.projectActions.onRenameTrack);
    expect(props.gridSettings).toBe(controller.state.gridSettings);
    expect(props.onApplyMediaClipVisualsToTrack).toBe(
      controller.clipActions.onApplyMediaClipVisualsToTrack
    );
    expect(props.onConvertTextClipToAnnotation).toBe(
      controller.clipActions.onConvertTextClipToAnnotation
    );
    expect(props.onUpdateAnnotationClipContent).toBe(
      controller.clipActions.onUpdateAnnotationClipContent
    );
    expect(props.onUpdateAnnotationClipStyle).toBe(
      controller.clipActions.onUpdateAnnotationClipStyle
    );
    expect(props.onUpdateAnnotationClipTemplate).toBe(
      controller.clipActions.onUpdateAnnotationClipTemplate
    );
    props.onUpdateClipPlaybackRate?.('clip-1', 1.25);
    expect(props.onUpdateMediaClipFitScalePercent).toBe(
      controller.clipActions.onUpdateMediaClipFitScalePercent
    );
    expect(props.onUpdateMediaClipShadowIntensity).toBe(
      controller.clipActions.onUpdateMediaClipShadowIntensity
    );
    expect(props.onUpdateMediaClipShadowMode).toBe(
      controller.clipActions.onUpdateMediaClipShadowMode
    );
    expect(props.onUpdateEffectInstance).toBe(controller.projectActions.onUpdateEffectInstance);
    props.onUpdateSubtitleTrackStyle?.('track-1', { color: '#fff' });

    expect(controller.clipActions.onUpdateClipPlaybackRate).toHaveBeenCalledWith('clip-1', 1.25);
    expect(controller.clipActions.onUpdateSubtitleTrackStyle).toHaveBeenCalledWith('track-1', {
      color: '#fff',
    });
  });
});
