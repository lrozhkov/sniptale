// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoMotionCameraMode,
  VideoMotionPathTargetKind,
} from '../../../../../features/video/project/types';
import { InspectMotionPanel } from './motion';
import { createMotionPanelProps } from '../motion/test-support';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
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

describe('workspace-sidebar/selection/inspect-motion', () => {
  it('renders motion fields as slider-driven single-column controls', () => {
    renderPanel(createMotionPanelProps());

    expect(container?.textContent).toContain('videoEditor.sidebar.motionDurationLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionBlurLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionOverlayZoomLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionZoomInLabel');
    expect(container?.querySelector('input[type="range"]')).not.toBeNull();
    expect(
      container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.segmented-field"].grid')
    ).toHaveLength(2);
  });

  it('renders moving zoom path controls for editable stops and segments', () => {
    renderPanel(createMovingZoomPanelProps());
    clickGroup('videoEditor.sidebar.inspectorGroupPath');

    expect(container?.textContent).toContain('videoEditor.sidebar.motionPathAddStop');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionPathTrajectoryLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionPathPickStopArea');
  });

  it('renders the delete motion action with the shared danger action style', () => {
    renderPanel(createMotionPanelProps());

    const deleteButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('common.actions.delete')
    );

    expect(deleteButton?.className).toContain('hover:text-[var(--sniptale-color-danger)]');
    expect(deleteButton?.className).toContain('rounded-[12px]');
  });
});

function renderPanel(props: ReturnType<typeof createMotionPanelProps>) {
  act(() => {
    root?.render(<InspectMotionPanel {...props} />);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function createMovingZoomPanelProps() {
  return createMotionPanelProps({
    cameraMode: VideoMotionCameraMode.PATH,
    path: {
      segments: [{ durationWeight: 1, easing: 'EASE_IN_OUT', trajectoryPreset: 'SOFT_ARC' }],
      stops: [
        {
          id: 'stop-1',
          offset: 0,
          target: { kind: VideoMotionPathTargetKind.POINT, scale: 1.5, x: 320, y: 180 },
        },
        {
          id: 'stop-2',
          offset: 1,
          target: { height: 180, kind: VideoMotionPathTargetKind.AREA, width: 280, x: 400, y: 220 },
        },
      ],
    },
  });
}
