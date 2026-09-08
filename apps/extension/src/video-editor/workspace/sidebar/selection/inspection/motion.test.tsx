// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectMotionPanel, InspectMotionConnectionPanel } from './motion';
import { VideoTemporalEasing } from '../../../../../features/video/project/types';
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
  it('disconnects the selected transition without deleting either framing state', () => {
    const props = createMotionPanelProps();
    props.onUpdateMotionRegion = vi.fn();
    props.onDeleteMotionRegion = vi.fn();
    const first = { ...props.selectedMotionRegion!, id: 'first', startTime: 0, duration: 1 };
    const second = {
      ...first,
      id: 'second',
      startTime: 3,
      incomingConnection: { fromRegionId: 'first', easing: VideoTemporalEasing.LINEAR },
    };
    props.project.motionRegions = [first, second];
    props.selection = { kind: 'motion-connection', motionRegionId: 'second' };
    act(() => root?.render(<InspectMotionConnectionPanel {...props} />));
    const remove = Array.from(container!.querySelectorAll('button')).find(
      (button) => button.textContent === 'videoEditor.timeline.disconnectFraming'
    )!;
    expect(remove).toBeDefined();
    act(() => remove.click());
    expect(props.onUpdateMotionRegion).toHaveBeenCalledWith('second', { incomingConnection: null });
    expect(props.onDeleteMotionRegion).not.toHaveBeenCalled();
    props.project.utilityLanes = {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    };
    act(() => root?.render(<InspectMotionConnectionPanel {...props} />));
    expect(container!.querySelector('fieldset')!.disabled).toBe(true);
  });
  it('keeps the default zoom workflow together and moves timing and behavior to focused groups', () => {
    renderPanel(createMotionPanelProps());

    expect(container?.textContent).toContain('videoEditor.sidebar.motionScaleLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionFocusLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.selectPointOnStage');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.motionDurationLabel');
    expect(container?.querySelector('input[type="range"]')).not.toBeNull();

    clickGroup('videoEditor.sidebar.inspectorGroupTiming');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionDurationLabel');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.motionZoomInLabel');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.motionBlurLabel');

    clickGroup('videoEditor.sidebar.inspectorGroupAnimation');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionZoomInLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionBlurLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.motionOverlayZoomLabel');
  });

  it('keeps zoom inspector actions read-only while the utility lane is locked', () => {
    const props = createMotionPanelProps();
    props.project.utilityLanes = {
      actions: { locked: false, visible: true },
      camera: { locked: true, visible: true },
    };
    renderPanel(props);

    expect(
      container?.querySelector<HTMLFieldSetElement>('[data-video-editor-motion-controls]')?.disabled
    ).toBe(true);
    const deleteButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('common.actions.delete')
    );
    expect(deleteButton?.disabled).toBe(true);
  });

  it('uses framing states without a parallel moving-path editor and keeps precise coordinates collapsed', () => {
    renderPanel(createMotionPanelProps());
    expect(container?.textContent).not.toContain('videoEditor.sidebar.motionCameraModeLabel');
    expect(
      container?.querySelector('nav button[title="videoEditor.sidebar.inspectorGroupPath"]')
    ).toBeNull();
    expect(container?.textContent).not.toContain('videoEditor.sidebar.motionPathAddStop');
    const details = container?.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('videoEditor.sidebar.motionFocusXLabel');
    expect(details?.textContent).toContain('videoEditor.sidebar.motionFocusYLabel');
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
  const button = container?.querySelector<HTMLElement>(`nav button[title="${title}"]`);
  act(() => {
    if (!button?.parentElement?.hasAttribute('open'))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
