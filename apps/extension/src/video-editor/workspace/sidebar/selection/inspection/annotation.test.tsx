// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import { WorkspaceSidebarInspectPanel } from '../inspect';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  getCurrentLocale: () => 'en',
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
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
});

function createSelectionHandlers() {
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
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
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

function createProps() {
  const project = createEmptyVideoProject('Annotation');
  const overlayTrackId = project.tracks.find((track) => track.kind === 'OVERLAY')?.id ?? 'overlay';
  const clip = createAnnotationClip(
    overlayTrackId,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.POINTER_LABEL
  );
  project.clips.push(clip);

  return {
    project,
    selection: {
      clipId: clip.id,
      kind: VideoEditorSelectionKind.CLIP,
    },
    selectedActionEvent: null,
    selectedClip: clip,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    placementMode: null,
    recentColors: [] as string[],
    ...createSelectionHandlers(),
  } as const;
}

describe('workspace-sidebar/selection/inspect-annotation', () => {
  it('renders grouped annotation inspector metadata for template overlays', () => {
    renderInspectPanel();

    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupSummary');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupGeneral');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupContent');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupTarget');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupMotion');
    expect(container?.textContent).toContain('videoEditor.sidebar.annotationTemplatePointerLabel');

    clickGroup('videoEditor.sidebar.inspectorGroupGeneral');
    expect(container?.textContent).toContain('videoEditor.templates.overlayGroupCallouts');
    expect(container?.textContent).toContain('videoEditor.templates.overlayUseCasePointerLabel');
    expect(container?.textContent).toContain(
      'videoEditor.templates.overlayDescriptionPointerLabel'
    );
    expect(container?.textContent).toContain('videoEditor.templates.previewToneTechnical');
    expect(container?.textContent).toContain('videoEditor.templates.previewMotionFocus');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.annotationDirectionLabel');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.annotationTargetLabel');
  });
});

function renderInspectPanel() {
  act(() => {
    root?.render(<WorkspaceSidebarInspectPanel {...createProps()} />);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
