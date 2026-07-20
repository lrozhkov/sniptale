// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectScenePanel } from './scene';

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

describe('workspace-sidebar/selection/inspect-scene/object-tracks', () => {
  it('shows pixel-detected cursor tracks and deletes the selected track', () => {
    const onDeleteObjectTrack = vi.fn();
    const onSelectObjectTrack = vi.fn();
    const project = createEmptyVideoProject('Scene object tracks');
    project.objectTracks = [
      {
        detectorVersion: 'pixel-cursor-v1',
        id: 'visual-cursor',
        kind: 'visualCursor',
        samples: [
          { confidence: 0.92, time: 0.25, visible: true, x: 120, y: 80 },
          { confidence: 0.72, time: 0.75, visible: true, x: 180, y: 140 },
          { confidence: 0.3, time: 1.25, visible: false, x: 220, y: 160 },
        ],
        source: 'visualDetection',
      },
    ];

    renderScenePanel({
      project,
      onDeleteObjectTrack,
      onSelectObjectTrack,
    });
    clickGroup('videoEditor.sidebar.inspectorGroupObjectTracks');

    expect(container?.textContent).toContain('videoEditor.sidebar.objectTracksTitle');
    expect(container?.textContent).toContain('videoEditor.sidebar.objectTrackKindVisualCursor');
    expect(container?.textContent).toContain(
      'videoEditor.sidebar.objectTrackSourceVisualDetection'
    );
    expect(container?.textContent).toContain('pixel-cursor-v1');
    expect(container?.textContent).toContain('82%');
    expect(container?.textContent).toContain('0.25-1.25 s');

    clickButton('videoEditor.sidebar.objectTrackSelectLabel');
    expect(onSelectObjectTrack).toHaveBeenCalledWith('visual-cursor');

    clickButton('videoEditor.sidebar.objectTrackDeleteLabel');

    expect(onDeleteObjectTrack).toHaveBeenCalledWith('visual-cursor');
  });
});

function renderScenePanel(
  props: Pick<
    WorkspaceSidebarSelectionPanelProps,
    'project' | 'onDeleteObjectTrack' | 'onSelectObjectTrack'
  >
) {
  act(() => {
    root?.render(
      <InspectScenePanel
        {...({
          onPreviewSceneBackground: vi.fn(),
          onRememberRecentColor: vi.fn(async () => undefined),
          onResetSceneBackgroundPreview: vi.fn(),
          onResizeProject: vi.fn(),
          onSetSceneBackground: vi.fn(),
          recentColors: [],
          ...props,
        } as unknown as WorkspaceSidebarSelectionPanelProps)}
      />
    );
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function clickButton(label: string) {
  const button = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (candidate) => candidate.textContent === label
  );
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
