// @vitest-environment jsdom
import {
  createProject,
  createVideoClip,
} from '../../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoProjectActionOccurrences } from '../../../../../features/video/project/action-occurrences';

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

vi.mock('../shared/controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/controls')>()),
  SelectInput: (props: {
    label: string;
    value: string;
    disabled?: boolean;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
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

  const action = {
    data: {},
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 120, y: 240 },
    presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE, duration: 0.4 },
    anchor: { kind: 'project' as const, time: 1.25 },
  };
  project.actionEvents = [action];
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
    selectedActionOccurrence: resolveVideoProjectActionOccurrences(project)[0]!,
    selectedMotionRegion: null,
    selectedTrack: null,
    placementMode: null,
    recentColors: [] as string[],
    ...createSelectionHandlers(),
  } as const;
}

describe('effect-panels', () => {
  it('edits one override without changing captured identity or pinning other defaults', () => {
    const props = createProps();
    const event = {
      ...props.selectedActionOccurrence.event,
      kind: VideoProjectActionEventKind.KEY,
      presentation: { offset: -0.2 },
    };
    props.project.actionEvents = [event];
    renderPanel(
      <InspectActionPanel
        {...props}
        selectedActionOccurrence={resolveVideoProjectActionOccurrences(props.project)[0]!}
      />
    );
    changeSelect('videoEditor.sidebar.historyEventMode', 'on');
    expect(props.onUpdateActionEventDetails).toHaveBeenLastCalledWith(event.id, {
      clipId: null,
      presentation: { offset: -0.2, enabled: true },
    });
    expect(
      container?.querySelector('select[aria-label="videoEditor.sidebar.actionPresetLabel"]')
    ).toBeNull();
    expect(
      container?.querySelector(
        'nav button[aria-label="videoEditor.sidebar.inspectorGroupPlacement"]'
      )
    ).toBeNull();
    expect(event.kind).toBe(VideoProjectActionEventKind.KEY);
    expect(event.point).toEqual({ x: 120, y: 240 });
  });

  it('restores enabled inheritance independently and resets the whole override explicitly', () => {
    const props = createProps();
    const event = {
      ...props.selectedActionOccurrence.event,
      presentation: { enabled: false, offset: -0.2 },
    };
    props.project.actionEvents = [event];
    renderPanel(
      <InspectActionPanel
        {...props}
        selectedActionOccurrence={resolveVideoProjectActionOccurrences(props.project)[0]!}
      />
    );
    changeSelect('videoEditor.sidebar.historyEventMode', 'inherit');
    expect(props.onUpdateActionEventDetails).toHaveBeenLastCalledWith(event.id, {
      clipId: null,
      presentation: { offset: -0.2 },
    });
    const reset = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'videoEditor.sidebar.historyReset'
    );
    act(() => reset?.click());
    expect(props.onUpdateActionEventDetails).toHaveBeenLastCalledWith(event.id, {
      clipId: null,
      presentation: null,
    });
    expect(props.onDeleteActionEvent).not.toHaveBeenCalled();
  });

  it('keeps disabled history events inspectable while locking presentation mutations', () => {
    const props = createProps();
    props.project.utilityLanes = {
      actions: { visible: true, locked: true },
      camera: { visible: true, locked: false },
    };
    const event = { ...props.selectedActionOccurrence.event, presentation: { enabled: false } };
    props.project.actionEvents = [event];
    renderPanel(
      <InspectActionPanel
        {...props}
        selectedActionOccurrence={resolveVideoProjectActionOccurrences(props.project)[0]!}
      />
    );
    expect(container?.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true);
    const reset = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'videoEditor.sidebar.historyReset'
    );
    act(() => reset?.click());
    expect(props.onUpdateActionEventDetails).not.toHaveBeenCalled();
    clickGroup('videoEditor.sidebar.inspectorGroupInfo');
    expect(container?.textContent).toContain('videoEditor.sidebar.historyForceOff');
  });

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
    expect(container?.textContent).toContain('videoEditor.sidebar.historyEventKind');
    expect(container?.textContent).toContain('CLICK');
    expect(
      container?.querySelector(
        'nav button[aria-label="videoEditor.sidebar.inspectorGroupPlacement"]'
      )
    ).not.toBeNull();
  });
});

function renderPanel(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLElement>(`nav button[title="${title}"]`);
  act(() => {
    if (!button?.parentElement?.hasAttribute('open'))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function changeSelect(label: string, value: string) {
  const select = container?.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`Missing select: ${label}`);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('explains shared fact settings and authorizes the selected repeated occurrence', () => {
  const props = createProps();
  props.project.duration = 20;
  props.project.clips = [
    createVideoClip({ id: 'first', sourceInstanceId: 'instance', startTime: 0 }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'instance', startTime: 10 }),
  ];
  props.project.assets = createProject(props.project.clips).assets;
  props.project.tracks = createProject(props.project.clips).tracks;
  props.project.actionEvents = [
    {
      id: 'shared',
      kind: 'CLICK',
      label: 'Shared click',
      data: {},
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
    },
  ];
  const occurrence = resolveVideoProjectActionOccurrences(props.project).find(
    (row) => row.clipId === 'repeat'
  )!;
  renderPanel(
    <InspectActionPanel {...props} currentTime={11} selectedActionOccurrence={occurrence} />
  );
  expect(container?.textContent).toContain('videoEditor.sidebar.actionSharedOccurrencesHint');
  changeSelect('videoEditor.sidebar.historyEventMode', 'on');
  expect(props.onUpdateActionEventDetails).toHaveBeenLastCalledWith('shared', {
    clipId: 'repeat',
    presentation: { enabled: true },
  });
});
