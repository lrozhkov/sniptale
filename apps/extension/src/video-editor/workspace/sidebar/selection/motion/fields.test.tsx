import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoEditorSelectionKind,
  type VideoEditorSelection,
} from '../../../../contracts/selection';
import { VideoMotionOverlayZoomMode } from '../../../../../features/video/project/types';
import { MotionBlurField, MotionTransitionTypeField, MotionOverlayZoomField } from './fields';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
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
    selectedActionOccurrence: null,
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
  it('renders each phase through the canonical mode choices', () => {
    const markup = renderToStaticMarkup(
      <MotionTransitionTypeField
        motionRegion={createVideoProjectMotionRegion(createPanelProps().project, 0)}
        phase="enter"
        panel={createPanelProps()}
      />
    );

    expect(markup).toContain('gallery.videoReview.zoomTransitionType');
    expect(markup).toContain('gallery.videoReview.transitionSmooth');
    expect(markup).toContain('gallery.videoReview.transitionNone');
    expect(markup).toContain('videoEditor.sidebar.temporalEasingInstant');
  });

  it('renders motion blur through canonical slider controls', () => {
    const markup = renderToStaticMarkup(
      <MotionBlurField
        phase="enter"
        panel={createPanelProps()}
        motionRegion={{
          ...createVideoProjectMotionRegion(createPanelProps().project, 0),
          motionBlurAmount: 0.45,
        }}
      />
    );

    expect(markup).toContain('gallery.videoReview.motionBlur');
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
