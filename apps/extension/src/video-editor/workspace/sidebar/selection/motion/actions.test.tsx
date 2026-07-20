// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';
import { MotionQuickActions } from './actions';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProject() {
  const project = createEmptyVideoProject('Motion', 1200, 800);
  project.actionEvents = [
    {
      data: {},
      duration: 0.5,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Action',
      point: { x: 900, y: 420 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 1.2,
    } as WorkspaceSidebarSelectionPanelProps['project']['actionEvents'][number],
  ];
  project.motionRegions = [
    {
      duration: 2.8,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusArea: { x: 300, y: 200, width: 240, height: 160 },
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 420, y: 280 },
      id: 'motion-1',
      motionBlurAmount: 0.2,
      scale: 1.6,
      startTime: 0.5,
      targetActionEventId: null,
      zoomInDuration: 0.35,
      zoomOutDuration: 0.35,
    },
  ];
  return project;
}

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
    onResizeProject: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
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
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
  };
}

function createPanelProps(): WorkspaceSidebarSelectionPanelProps {
  const project = createProject();
  const selectedMotionRegion = project.motionRegions?.[0] ?? null;
  if (!selectedMotionRegion) {
    throw new Error('Expected motion region fixture');
  }

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion,
    selectedTrack: null,
    selectedTransition: null,
    selection: {
      kind: VideoEditorSelectionKind.MOTION_REGION,
      motionRegionId: selectedMotionRegion.id,
    },
    ...createCallbacks(),
  };
}

async function renderActions(props: WorkspaceSidebarSelectionPanelProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<MotionQuickActions panel={props} />);
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workspace-sidebar/selection/motion-actions', () => {
  registerMotionFocusControlTests();
  registerMotionFocusActionTests();
});

function registerMotionFocusControlTests() {
  it('renders focus modes as shared compact toggle controls', async () => {
    const props = createPanelProps();

    await renderActions(props);

    const manual = findButton('videoEditor.sidebar.motionFocusManual');
    const cursor = findButton('videoEditor.sidebar.motionFocusCursor');

    expect(manual?.getAttribute('aria-pressed')).toBe('true');
    expect(manual?.className).toContain('shadow-[inset_0_0_0_1px_color-mix');
    expect(cursor?.getAttribute('aria-pressed')).toBe('false');
    expect(cursor?.className).toContain('hover:text-[var(--sniptale-color-text-primary-strong)]');
  });

  it('switches manual point focus into manual area using the current point/scale', async () => {
    const props = createPanelProps();
    if (!props.selectedMotionRegion) {
      throw new Error('Expected motion region fixture');
    }
    props.selectedMotionRegion.focusArea = null;

    await renderActions(props);
    await act(async () => {
      findButton('videoEditor.sidebar.motionFocusManualArea')?.click();
    });

    expect(props.onClearPlacementMode).toHaveBeenCalledTimes(1);
    expect(props.onUpdateMotionRegion).toHaveBeenCalledWith(
      'motion-1',
      expect.objectContaining({
        focusMode: VideoMotionFocusMode.MANUAL_AREA,
        focusArea: expect.objectContaining({ width: 750, height: 500, x: 45, y: 30 }),
      })
    );
  });
}

function registerMotionFocusActionTests() {
  it('switches into action-follow mode using the first available action target', async () => {
    const props = createPanelProps();
    props.project.actionEvents.unshift({
      data: {},
      duration: 0.4,
      id: 'legacy-scroll',
      kind: VideoProjectActionEventKind.SCROLL,
      label: 'Legacy scroll',
      point: null,
      preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
      time: 0.6,
    } as WorkspaceSidebarSelectionPanelProps['project']['actionEvents'][number]);

    await renderActions(props);
    await act(async () => {
      findButton('videoEditor.sidebar.motionFocusAction')?.click();
    });

    expect(props.onUpdateMotionRegion).toHaveBeenCalledWith('motion-1', {
      focusMode: VideoMotionFocusMode.ACTION,
      targetActionEventId: 'action-1',
    });
  });
}
