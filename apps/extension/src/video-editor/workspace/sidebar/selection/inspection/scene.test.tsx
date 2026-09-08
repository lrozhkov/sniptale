// @vitest-environment jsdom
import { WorkspaceSidebarSelectionBody } from './body';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoProjectSourceKind,
  VideoSceneBackgroundKind,
} from '../../../../../features/video/project/types';
import { createSceneSelection } from '../../../../project/selection/model';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
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

function createSceneSelectionHandlers() {
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
  return {
    project: createEmptyVideoProject('Scene'),
    selection: createSceneSelection(),
    selectedClip: null,
    selectedTransition: null,
    selectedCursorSample: null,
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    placementMode: null,
    recentColors: [] as string[],
    ...createSceneSelectionHandlers(),
  } as const;
}

function createSceneImageAsset() {
  return createVideoProjectAsset(
    'Scene Background',
    VideoProjectAssetType.IMAGE,
    { kind: 'recording', recordingId: 'rec-scene' },
    {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 720,
      mimeType: 'image/png',
      size: 100,
      width: 1280,
    }
  );
}

function verifiesSceneMetadataFocus() {
  renderInspectPanel(createProps());
  clickGroup('videoEditor.sidebar.inspectorGroupSummary');

  expect(container?.textContent).not.toContain('videoEditor.sidebar.projectSourceLabel');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.timelinePlacementLabel');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.actionsTitle');
}

function verifiesRecordingBackedSummaries() {
  const props = createProps();
  props.project.source = { kind: VideoProjectSourceKind.RECORDING, recordingId: 'rec-1' };
  props.project.cursorTrack = null;
  props.project.actionEvents = [];

  renderInspectPanel(props);
  clickGroup('videoEditor.sidebar.inspectorGroupSummary');

  expect(container?.textContent).not.toContain('videoEditor.sidebar.cursorTrackUnavailable');
  expect(container?.textContent).not.toContain('videoEditor.timeline.actionsLane');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.actionTrackUnavailable');
}

function verifiesAuthoredEventSummary() {
  const props = createProps();
  props.project.source = { kind: VideoProjectSourceKind.RECORDING, recordingId: 'rec-1' };
  props.project.actionEvents = [
    {
      data: {},

      id: 'legacy-scroll',
      kind: VideoProjectActionEventKind.SCROLL,
      label: 'Legacy scroll',
      point: null,

      anchor: { kind: 'project', time: 0.5 },
      presentation: { duration: 0.6, preset: VideoProjectActionPreset.SCROLL_EMPHASIS },
    },
  ];

  renderInspectPanel(props);
  clickGroup('videoEditor.sidebar.inspectorGroupSummary');

  expect(container?.textContent).not.toContain('videoEditor.sidebar.actionTrackUnavailable');
  expect(container?.textContent).toContain('1920×1080');
}

function verifiesSceneBackgroundSelectLabels() {
  const props = createProps();
  props.project.assets = [createSceneImageAsset()];
  const imageAsset = props.project.assets[0];
  if (!imageAsset) {
    throw new Error('Expected test image asset');
  }

  props.project.sceneBackground = {
    kind: VideoSceneBackgroundKind.IMAGE,
    assetId: imageAsset.id,
  };

  renderInspectPanel(props);
  clickGroup('videoEditor.sidebar.inspectorGroupBackground');

  expect(container?.textContent).toContain('videoEditor.sidebar.sceneBackgroundTypeLabel');
  expect(container?.textContent).toContain('videoEditor.sidebar.sceneBackgroundImage');
  expect(container?.textContent).toContain('videoEditor.sidebar.sceneBackgroundImageAssetLabel');
  expect(container?.textContent).toContain('Scene Background');
  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.select-field"]')
  ).toHaveLength(2);
  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.segmented-field"]')
  ).toBeNull();
}

describe('workspace-sidebar/selection/inspect-scene', () => {
  it(
    'keeps scene inspector focused on scene metadata instead of legacy montage controls',
    verifiesSceneMetadataFocus
  );

  it(
    'shows recording cursor and actions summaries for recording-backed projects',
    verifiesRecordingBackedSummaries
  );

  it('counts authored scroll events in the scene summary', verifiesAuthoredEventSummary);

  it(
    'renders canonical scene background select labels for image backgrounds',
    verifiesSceneBackgroundSelectLabels
  );
});

function renderInspectPanel(props: WorkspaceSidebarSelectionPanelProps) {
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

it('shows grid as a Canvas parameter through the complete selection body', () => {
  const gridSettings = {
    enabled: false,
    snapEnabled: true,
    size: 80,
    color: '#94a3b8',
    onSetEnabled: vi.fn(),
    onSetSnapEnabled: vi.fn(),
    onSetSize: vi.fn(),
    onSetColor: vi.fn(),
  };
  const render = () =>
    act(() =>
      root?.render(<WorkspaceSidebarSelectionBody {...createProps()} gridSettings={gridSettings} />)
    );
  render();
  const grid = () => container!.querySelector('[data-ui="video-editor.scene.grid-settings"]')!;
  expect(grid()).not.toBeNull();
  expect(grid().textContent).not.toContain('videoEditor.app.gridSizeLabel');
  act(() =>
    grid()
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.app.gridVisibleToggle"]')!
      .click()
  );
  expect(gridSettings.onSetEnabled).toHaveBeenCalledWith(true);
  gridSettings.enabled = true;
  render();
  expect(grid().textContent).toContain('videoEditor.app.gridSizeLabel');
  expect(grid().textContent).toContain('videoEditor.app.gridColorLabel');
});
