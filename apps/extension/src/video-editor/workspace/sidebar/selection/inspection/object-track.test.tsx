// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import type { VideoObjectTrack } from '../../../../../features/video/project/object-tracks';
import {
  createSelectionPanelProps,
  WorkspaceSidebarSelectionPanel,
} from '../../panel-content/selection-panel';
import type {
  WorkspaceSidebarSelectionPanelProps,
  WorkspaceSidebarSelectionPanelSourceProps,
} from '../../contracts/selection-panel';
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

describe('workspace-sidebar/selection/inspect-object-track', () => {
  it('does not surface follow template controls on the selected object track', () => {
    const objectTrack = createObjectTrack();
    const project = createEmptyVideoProject('Object track');
    project.objectTracks = [objectTrack];

    renderInspectPanel(project, objectTrack);
    expect(container?.textContent).toContain('videoEditor.sidebar.objectTrackKindVisualCursor');
    expect(container?.textContent).not.toContain(
      'videoEditor.sidebar.inspectorGroupFollowInstances'
    );
  });

  it('keeps selected object track state through the selection panel adapter', () => {
    const objectTrack = createObjectTrack();
    const project = createEmptyVideoProject('Object track panel adapter');
    project.objectTracks = [objectTrack];

    renderSelectionPanel(project, objectTrack);

    expect(container?.textContent).toContain('videoEditor.sidebar.objectTrackKindVisualCursor');
  });
});

describe('workspace-sidebar/selection/object-track-status', () => {
  it('hides internal camera cursor tracks from the scene object track list', () => {
    const visibleTrack = createObjectTrack();
    const hiddenTrack: VideoObjectTrack = {
      ...createObjectTrack(),
      hidden: true,
      id: 'hidden-camera-cursor',
      role: 'cameraCursor',
    };
    const project = createEmptyVideoProject('Object tracks');
    project.objectTracks = [hiddenTrack, visibleTrack];

    renderInspectPanel(project, null);
    clickGroup('videoEditor.sidebar.inspectorGroupObjectTracks');

    expect(container?.textContent).toContain(visibleTrack.id);
    expect(container?.textContent).not.toContain(hiddenTrack.id);
  });

  it('keeps the confidence strip bounded for long detected tracks', () => {
    const objectTrack = createObjectTrackWithSamples(420);
    const project = createEmptyVideoProject('Long object track');
    project.objectTracks = [objectTrack];

    renderInspectPanel(project, objectTrack);
    clickGroup('videoEditor.sidebar.inspectorGroupStatus');

    const confidenceSegments = container?.querySelectorAll(
      '[data-ui="video-editor.object-track.confidence-segment"]'
    );
    expect(confidenceSegments?.length).toBeLessThanOrEqual(160);
  });
});

function createObjectTrack(): VideoObjectTrack {
  return {
    id: 'visual-cursor',
    kind: 'visualCursor',
    samples: [{ confidence: 1, time: 0, visible: true, x: 140, y: 90 }],
    source: 'visualDetection',
  };
}

function createObjectTrackWithSamples(count: number): VideoObjectTrack {
  return {
    ...createObjectTrack(),
    samples: Array.from({ length: count }, (_, index) => ({
      confidence: index % 17 === 0 ? 0.25 : 0.9,
      time: index / 10,
      visible: index % 31 !== 0,
      x: 140 + index,
      y: 90,
    })),
  };
}

function renderInspectPanel(
  project: WorkspaceSidebarSelectionPanelProps['project'],
  selectedObjectTrack: VideoObjectTrack | null
) {
  act(() => {
    root?.render(
      <WorkspaceSidebarInspectPanel
        {...({
          project,
          selectedObjectTrack,
          selection: selectedObjectTrack
            ? { kind: 'object-track', objectTrackId: selectedObjectTrack.id }
            : { kind: 'scene' },
        } as WorkspaceSidebarSelectionPanelProps)}
      />
    );
  });
}

function renderSelectionPanel(
  project: WorkspaceSidebarSelectionPanelProps['project'],
  selectedObjectTrack: VideoObjectTrack
) {
  act(() => {
    root?.render(
      <WorkspaceSidebarSelectionPanel
        {...createSelectionPanelProps(
          createSelectionPanelSource({
            project,
            selectedObjectTrack,
          })
        )}
      />
    );
  });
}

function createSelectionPanelSource(args: {
  project: WorkspaceSidebarSelectionPanelProps['project'];
  selectedObjectTrack: VideoObjectTrack;
}): WorkspaceSidebarSelectionPanelSourceProps {
  return {
    onAddActionEvent: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    project: args.project,
    selectedClip: null,
    selectedObjectTrack: args.selectedObjectTrack,
    selectedTrack: null,
    selection: { kind: 'object-track', objectTrackId: args.selectedObjectTrack.id },
  };
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
