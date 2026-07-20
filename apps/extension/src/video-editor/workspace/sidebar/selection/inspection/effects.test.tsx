// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
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
  const project = createEmptyVideoProject('Transition');

  return {
    project,
    selection: {
      kind: VideoEditorSelectionKind.TRANSITION_JUNCTION,
      transitionId: 'transition-1',
    },
    selectedClip: null,
    selectedTransition: {
      direction: 'RIGHT',
      duration: 0.8,
      easing: 'EASE_IN_OUT',
      highlightColor: '#f97316',
      id: 'transition-1',
      intensity: 'BOLD',
      kind: 'LIGHT_SWEEP',
      leadingClipId: 'clip-a',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
      trailingClipId: 'clip-b',
    },
    selectedCursorSample: null,
    selectedActionEvent: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    placementMode: null,
    recentColors: [] as string[],
    ...createSelectionHandlers(),
  } as const;
}

describe('workspace-sidebar/selection/inspect-effects', () => {
  it('renders grouped transition inspector metadata for non-crossfade presets', () => {
    renderInspectPanel();

    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupTemplate');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupTiming');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupStatus');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupStyle');
    expect(container?.textContent).toContain('videoEditor.sidebar.transitionLightSweep');

    clickGroup('videoEditor.sidebar.inspectorGroupSummary');
    expect(container?.textContent).toContain('videoEditor.templates.transitionGroupReveal');
    expect(container?.textContent).toContain('videoEditor.templates.transitionUseCaseLightSweep');
    expect(container?.textContent).toContain(
      'videoEditor.templates.transitionDescriptionLightSweep'
    );
    expect(container?.textContent).toContain('videoEditor.templates.previewToneHero');
    expect(container?.textContent).toContain('videoEditor.templates.previewMotionSweep');

    clickGroup('videoEditor.sidebar.inspectorGroupTiming');
    expect(container?.textContent).toContain('videoEditor.sidebar.transitionDirectionLabel');
    expect(container?.textContent).not.toContain(
      'videoEditor.sidebar.transitionHighlightColorLabel'
    );
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
