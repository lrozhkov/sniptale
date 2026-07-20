// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import { InspectActionPanel } from './panels/action-panel';
import { InspectTransitionPanel } from './panels/transition-panel';

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
    onUpdateEffectInstance: vi.fn(),
  };
}

function createProps() {
  const project = createEmptyVideoProject('Effects panels');

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
    selectedActionEvent: {
      data: {},
      duration: 0.4,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 120, y: 240 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 1.25,
    },
    selectedMotionRegion: null,
    selectedTrack: null,
    placementMode: null,
    recentColors: [] as string[],
    ...createSelectionHandlers(),
  } as const;
}

describe('effect-panels', () => {
  it('renders split transition and action panels with the same inspector metadata', () => {
    const props = createProps();

    renderPanel(<InspectTransitionPanel {...props} />);
    clickGroup('videoEditor.sidebar.inspectorGroupSummary');
    expect(container?.textContent).toContain('videoEditor.sidebar.transitionLightSweep');
    expect(container?.textContent).toContain('videoEditor.templates.catalogStatusOptional');

    clickGroup('videoEditor.sidebar.inspectorGroupTemplate');
    expect(container?.textContent).toContain('videoEditor.sidebar.transitionSwapStyleLabel');

    clickGroup('videoEditor.sidebar.inspectorGroupStyle');
    expect(container?.textContent).toContain('videoEditor.sidebar.transitionHighlightColorLabel');

    renderPanel(<InspectActionPanel {...props} />);
    clickGroup('videoEditor.sidebar.inspectorGroupInfo');
    expect(container?.textContent).toContain('videoEditor.timeline.actionsLane');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupPlacement');
  });
});

function renderPanel(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
