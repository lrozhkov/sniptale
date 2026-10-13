// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../../../features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../../features/video/project/defaults';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
} from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import { WorkspaceSidebarInspectPanel } from '../inspect';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  getCurrentLocale: () => 'en',
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

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

function createSharedCallbacks() {
  return {
    onSetSceneBackground: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onResizeProject: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
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
    onUpdateEffectInstance: vi.fn(),
  };
}

function createProps() {
  const project = createEmptyVideoProject('Cursor');
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
    samples: [{ id: 'sample-1', time: 1.2, visible: true, x: 80, y: 120 }],
  };

  return {
    project,
    selection: {
      kind: VideoEditorSelectionKind.CURSOR_SEGMENT,
      sampleId: 'sample-1',
    },
    selectedClip: null,
    selectedTransition: null,
    selectedCursorSample: project.cursorTrack.samples[0] ?? null,
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    placementMode: null,
    recentColors: [] as string[],
    ...createSharedCallbacks(),
  } as const;
}

describe('workspace-sidebar/selection/inspect-cursor', () => {
  it('explains that cursor appearance settings apply to the whole cursor track', () => {
    renderInspectPanel(createProps());
    clickGroup('videoEditor.sidebar.inspectorGroupAppearance');

    expect(container?.textContent).not.toContain('videoEditor.sidebar.cursorTrackAppearanceTitle');
    expect(container?.textContent).not.toContain(
      'videoEditor.sidebar.cursorAppearanceTrackLinkHint'
    );
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorColorLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorCaptureModeSeparate');
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorAppearanceUnlink');
    expect(findButton('videoEditor.sidebar.cursorAppearanceUnlink')?.className).toContain(
      'hover:text-[var(--sniptale-color-accent-emphasis)]'
    );

    clickGroup('videoEditor.sidebar.inspectorGroupInfo');
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorAppearanceModeTrack');
  });

  it('keeps embedded overlay editing honest and does not offer ineffective interpolation', () => {
    const props = createProps();
    props.project.cursorTrack!.captureMode = VideoCursorCaptureMode.EMBEDDED_FALLBACK;
    const before = JSON.stringify(props.project);
    renderInspectPanel(props);

    expect(container?.textContent).toContain('videoEditor.sidebar.cursorCaptureModeFallback');
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorFallbackHint');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.cursorInterpolationLabel');
    const visibility = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="videoEditor.sidebar.inspectorSampleVisible"]'
    );
    expect(visibility).toBeTruthy();
    act(() => visibility?.click());
    expect(props.onUpdateCursorSampleVisibility).toHaveBeenCalledWith('sample-1', false);

    clickGroup('videoEditor.sidebar.inspectorGroupAppearance');
    act(() => findButton('videoEditor.sidebar.cursorAppearanceUnlink')?.click());
    expect(props.onUpdateCursorSampleSkinOverride).toHaveBeenCalledWith(
      'sample-1',
      props.project.cursorTrack!.skin
    );
    act(() => findButton('common.actions.delete')?.click());
    expect(props.onDeleteCursorSample).toHaveBeenCalledWith('sample-1');
    expect(props.onSetCursorCaptureMode).not.toHaveBeenCalled();
    expect(props.onUpdateCursorSampleInterpolation).not.toHaveBeenCalled();
    expect(JSON.stringify(props.project)).toBe(before);
  });

  it('restores an embedded overlay override and retains interpolation and capture mode', () => {
    const props = createProps();
    renderInspectPanel(props);
    clickGroup('videoEditor.sidebar.inspectorGroupAnimation');
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorInterpolationLabel');
    props.project.cursorTrack!.captureMode = VideoCursorCaptureMode.EMBEDDED_FALLBACK;
    props.project.cursorTrack!.samples[0]!.skinOverride = {
      ...props.project.cursorTrack!.skin,
      color: '#ff0000',
    };
    renderInspectPanel(props);
    clickGroup('videoEditor.sidebar.inspectorGroupAppearance');
    act(() => findButton('videoEditor.sidebar.cursorAppearanceRestoreTrack')?.click());
    expect(props.onClearCursorSampleSkinOverride).toHaveBeenCalledWith('sample-1');
    expect(props.onSetCursorCaptureMode).not.toHaveBeenCalled();
  });

  it('shows restore controls when a cursor segment has its own style override', () => {
    const props = createProps();
    if (!props.project.cursorTrack?.samples[0]) {
      throw new Error('Expected cursor sample fixture');
    }

    props.project.cursorTrack.samples[0].skinOverride = {
      animationPreset: VideoCursorAnimationPreset.FLOAT,
      color: '#00ff88',
      hidden: false,
      preset: VideoCursorVisualPreset.RING,
      scale: 1.7,
      shadow: false,
    };

    renderInspectPanel(props);
    clickGroup('videoEditor.sidebar.inspectorGroupAppearance');

    expect(container?.textContent).not.toContain(
      'videoEditor.sidebar.cursorAppearanceOverrideHint'
    );
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorAppearanceRestoreTrack');

    clickGroup('videoEditor.sidebar.inspectorGroupInfo');
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorAppearanceModeOverride');
  });
});

function renderInspectPanel(props: ReturnType<typeof createProps>) {
  act(() => {
    root?.render(<WorkspaceSidebarInspectPanel {...props} />);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLElement>(`nav button[title="${title}"]`);
  act(() => {
    if (!button?.parentElement?.hasAttribute('open'))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

it('opens the focus inspector for a retained manual key without creating a captured cursor track', () => {
  const props = createProps();
  props.project.cursorTrack = null;
  props.project.version = 3;
  props.project.duration = 2;
  props.project.cursorFocusPath = {
    version: 1,
    mode: 'fixed',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'manual-run',
        binding: { kind: 'project' },
        start: 0,
        end: 2,
        keys: [
          { id: 'sample-1', time: 1, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'smooth' },
        ],
      },
    ],
  };
  act(() =>
    root!.render(
      <WorkspaceSidebarInspectPanel
        {...props}
        selectedCursorSample={{
          id: 'sample-1',
          time: 1,
          x: props.project.width * 0.2,
          y: props.project.height * 0.3,
          visible: true,
        }}
      />
    )
  );
  expect(container!.querySelector('[data-ui="cursorFocusPath.inspector"]')).not.toBeNull();
  expect(props.project.cursorTrack).toBeNull();
  expect(props.onSetCursorCaptureMode).not.toHaveBeenCalled();
});

it('opens recorded focus geometry before legacy appearance and keeps embedded guidance compact', () => {
  const base = createProps();
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'take.webm',
    width: 640,
    height: 360,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      ...base.project.cursorTrack!,
      captureMode: 'embedded-fallback',
      samples: base.project.cursorTrack!.samples.map((sample) => ({
        ...sample,
        recordingPoint: { x: 0.125, y: 1 / 3 },
      })),
    },
  });
  renderInspectPanel({ ...base, project, selectedCursorSample: project.cursorTrack!.samples[0]! });
  const panel = container!.querySelector('[data-ui="cursorFocusPath.inspector"]');
  expect(panel).not.toBeNull();
  expect(panel!.textContent).not.toContain('videoEditor.sidebar.cursorFocusEmbedded');
  expect(panel!.getAttribute('title')).toBe('videoEditor.sidebar.cursorFocusEmbedded');
  expect(panel!.querySelector('input[aria-label="X"]')).not.toBeNull();
  expect(container!.querySelector('nav button[aria-pressed="true"]')?.getAttribute('title')).toBe(
    'videoEditor.sidebar.cursorFocusPathTitle'
  );
});
