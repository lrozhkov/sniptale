import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoEditorSelectionKind,
  type VideoEditorSelection,
} from '../../../../contracts/selection';
import {
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';
import { MotionBlurField, MotionEasingField, MotionOverlayZoomField } from './fields';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createCallbacks() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
  };
}

function createPanelProps(): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Motion');

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: {
      kind: VideoEditorSelectionKind.SCENE,
    } as VideoEditorSelection,
    ...createCallbacks(),
  };
}

describe('workspace-sidebar/selection/motion-fields', () => {
  it('renders motion easing through canonical temporal easing options', () => {
    const markup = renderToStaticMarkup(
      <MotionEasingField
        motionRegionId="motion-1"
        panel={createPanelProps()}
        value={VideoTemporalEasing.EASE_IN_OUT}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.motionEasingLabel');
    expect(markup).toContain('videoEditor.sidebar.temporalEasingEaseInOut');
  });

  it('renders motion blur through canonical slider controls', () => {
    const markup = renderToStaticMarkup(
      <MotionBlurField motionRegionId="motion-1" panel={createPanelProps()} value={0.45} />
    );

    expect(markup).toContain('videoEditor.sidebar.motionBlurLabel');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('45%');
  });

  it('renders overlay zoom mode through compact option buttons', () => {
    const markup = renderToStaticMarkup(
      <MotionOverlayZoomField
        motionRegionId="motion-1"
        panel={createPanelProps()}
        value={VideoMotionOverlayZoomMode.LOCK_OVERLAYS}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.motionOverlayZoomLabel');
    expect(markup).toContain('videoEditor.sidebar.motionOverlayZoomLock');
    expect(markup).toContain('videoEditor.sidebar.motionOverlayZoomFollowCamera');
    expect(markup).toContain('aria-pressed="true"');
  });
});
