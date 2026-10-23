import { MotionFocusFields, MotionFocusAnimationFields } from '../motion/appearance';
import {
  createProject,
  createVideoClip,
  createTrack,
} from '../../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../../features/video/project/motion/source-binding';
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../../features/video/project/scene/focus-appearance';
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
  it('edits link blur on the outgoing source and retains disabled strength', () => {
    const props = createMotionPanelProps();
    props.onUpdateMotionRegion = vi.fn();
    const first = {
      ...props.selectedMotionRegion!,
      id: 'first',
      startTime: 0,
      duration: 1,
      motionBlur: { link: { enabled: false, strength: 0.731 } },
    };
    const second = {
      ...first,
      id: 'second',
      startTime: 3,
      motionBlur: { link: { enabled: true, strength: 0.2 } },
      incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
    };
    props.project.motionRegions = [first, second];
    props.selection = { kind: 'motion-connection', motionRegionId: second.id };
    act(() => root?.render(<InspectMotionConnectionPanel {...props} />));
    const phase = container!.querySelector('[data-phase="link"]')!;
    expect(phase.querySelector('input[type="text"]')).toBeNull();
    act(() => phase.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(props.onUpdateMotionRegion).toHaveBeenCalledWith(first.id, {
      motionBlurPhase: { phase: 'link', enabled: true },
    });
    first.motionBlur.link.enabled = true;
    act(() => root?.render(<InspectMotionConnectionPanel {...props} />));
    expect(
      container!.querySelector<HTMLInputElement>('[data-phase="link"] input[type="text"]')?.value
    ).toContain('73.1');
    expect(second.motionBlur.link.strength).toBe(0.2);
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
    expect(container?.textContent).toContain('gallery.videoReview.zoomTransitionIn');
    expect(container?.textContent).toContain('gallery.videoReview.motionBlur');
    expect(container?.querySelectorAll('[data-ui="video-editor.motion.blur"]')).toHaveLength(2);
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

it('groups border settings and phases while preserving the camera mode command', () => {
  const props = createMotionPanelProps({
    border: createQuickEditBorder(),
    borderTarget: 'viewport',
  });
  props.onUpdateMotionRegion = vi.fn();
  renderPanel(props);
  expect(container?.textContent).toContain('gallery.videoReview.borderWidth');
  expect(container?.textContent).toContain('videoEditor.sidebar.borderTarget');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.motionScaleLabel');
  expect(
    container?.querySelector('nav button[title="gallery.videoReview.perspective"]')
  ).toBeNull();
  expect(
    container?.querySelector('nav button[title="gallery.videoReview.depthOfField"]')
  ).toBeNull();
  clickGroup('videoEditor.sidebar.inspectorGroupAnimation');
  expect(container?.textContent).toContain('gallery.videoReview.borderHold');
  expect(container?.textContent).not.toContain('gallery.videoReview.motionBlur');
  clickGroup('videoEditor.sidebar.inspectorGroupAppearance');
  const mode = container?.querySelector<HTMLButtonElement>(
    '[title="gallery.videoReview.zoomRegionLabel"]'
  );
  expect(mode).toBeTruthy();
  act(() => mode!.click());
  expect(props.onUpdateMotionRegion).toHaveBeenCalledWith(props.selectedMotionRegion!.id, {
    focusEdit: { kind: 'border' as const, enabled: false },
  });
});

it('keeps window selection with its target and exposes an independent clock only for viewport borders', () => {
  const clip = createVideoClip();
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 1),
      border: createQuickEditBorder(),
      borderTarget: 'window',
    },
    clip
  );
  project.motionRegions = [region];
  const props = createMotionPanelProps(region);
  props.project = project;
  props.selectedMotionRegion = region;
  renderPanel(props);
  clickGroup('videoEditor.sidebar.inspectorGroupTiming');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.framingBinding');
  const viewport = { ...region, borderTarget: 'viewport' as const };
  props.project = { ...project, motionRegions: [viewport] };
  props.selectedMotionRegion = viewport;
  renderPanel(props);
  expect(container?.textContent).toContain('videoEditor.sidebar.framingBinding');
});

it('previews border width without history, cancels it and commits only accepted authoring', () => {
  const props = createMotionPanelProps({
    border: createQuickEditBorder(),
    borderTarget: 'viewport',
  });
  props.onPreviewMotion = vi.fn();
  props.onUpdateMotionRegion = vi.fn();
  act(() =>
    root?.render(<MotionFocusFields panel={props} motionRegion={props.selectedMotionRegion!} />)
  );
  const width = container!.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.borderWidth range"]'
  )!;
  expect(width).toBeTruthy();
  const key = (type: string, value: string) =>
    act(() => width.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true })));
  key('keydown', 'ArrowRight');
  expect(props.onPreviewMotion).toHaveBeenLastCalledWith({
    kind: 'focus',
    project: props.project,
    regionId: props.selectedMotionRegion!.id,
    edit: { kind: 'border' as const, settings: { width: 4 } },
  });
  expect(props.onUpdateMotionRegion).not.toHaveBeenCalled();
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(props.onPreviewMotion).toHaveBeenLastCalledWith(null);
  expect(props.onUpdateMotionRegion).not.toHaveBeenCalled();
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(props.onUpdateMotionRegion).toHaveBeenCalledExactlyOnceWith(
    props.selectedMotionRegion!.id,
    { focusEdit: { kind: 'border' as const, settings: { width: 4 } } }
  );
  act(() => root?.render(null));
  expect(props.onPreviewMotion).toHaveBeenLastCalledWith(null);
});

it.each(['enter', 'exit'] as const)(
  'adapts %s reveal, phase duration and hold edits to Native commands',
  (phase) => {
    const props = createMotionPanelProps({
      border: createQuickEditBorder(),
      borderTarget: 'viewport',
      phaseTransitions: { enter: 'none', exit: 'none' },
    });
    props.onPreviewMotion = vi.fn();
    props.onUpdateMotionRegion = vi.fn();
    const render = () =>
      act(() =>
        root?.render(
          <MotionFocusAnimationFields panel={props} motionRegion={props.selectedMotionRegion!} />
        )
      );
    render();
    const phaseLabel = phase === 'enter' ? 'zoomTransitionIn' : 'zoomTransitionOut';
    const scope = () =>
      container!.querySelector(`[aria-label="gallery.videoReview.${phaseLabel}"]`)!;
    const click = (title: string, parent: ParentNode = scope()) => {
      const node = parent.querySelector<HTMLButtonElement>(
        `[title="gallery.videoReview.${title}"]`
      )!;
      expect(node).toBeTruthy();
      act(() => node.click());
    };
    click(phase === 'enter' ? 'borderDrawing' : 'borderErasing');
    const key = phase === 'enter' ? 'reveal' : 'exitReveal';
    expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(props.selectedMotionRegion!.id, {
      focusEdit: {
        kind: 'border' as const,
        settings: { [key]: phase === 'enter' ? 'draw' : 'erase' },
      },
      motionTransitionPhase: { phase, type: 'ease-in-out' },
    });
    props.selectedMotionRegion = {
      ...props.selectedMotionRegion!,
      phaseTransitions: { enter: 'linear', exit: 'ease-out' },
      border: {
        ...props.selectedMotionRegion!.border!,
        [key]: phase === 'enter' ? 'draw' : 'erase',
      },
    };
    props.project = { ...props.project, motionRegions: [props.selectedMotionRegion] };
    render();
    click('borderCounterclockwise');
    expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(props.selectedMotionRegion.id, {
      focusEdit: {
        kind: 'border' as const,
        settings: { [key]: phase === 'enter' ? 'draw-ccw' : 'erase-ccw' },
      },
      motionTransitionPhase: { phase, type: phase === 'enter' ? 'linear' : 'ease-out' },
    });
    const slider = scope().querySelector<HTMLInputElement>(
      '[aria-label="gallery.videoReview.zoomTransitionDuration range"]'
    )!;
    act(() =>
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(props.onPreviewMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'focus',
        edit: { kind: 'border' as const },
        transition: { phase, duration: expect.any(Number) },
      })
    );
    act(() =>
      slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    );
    expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(props.selectedMotionRegion.id, {
      focusEdit: { kind: 'border' as const },
      motionTransitionPhase: { phase, duration: expect.any(Number) },
    });
    click(phase === 'enter' ? 'borderAppear' : 'borderDisappear');
    expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(props.selectedMotionRegion.id, {
      focusEdit: { kind: 'border' as const, settings: {} },
      motionTransitionPhase: { phase, type: 'none' },
    });
    const hold = container!.querySelector('[aria-label="gallery.videoReview.borderHold"]')!;
    click('borderPulse', hold);
    expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(props.selectedMotionRegion.id, {
      focusEdit: { kind: 'border' as const, settings: { loop: true, motion: 'pulse' } },
    });
  }
);

it.each([false, true])(
  'identifies overlapping same-name border targets on one track=%s',
  (sameTrack) => {
    const first = createVideoClip({ id: 'first-target', name: 'Footage' });
    const second = createVideoClip({
      id: 'second-target',
      name: 'Footage',
      trackId: sameTrack ? first.trackId : 'overlay-track',
    });
    const project = createProject([first, second]);
    project.tracks.find((track) => track.id === first.trackId)!.name = 'Main';
    if (!sameTrack) project.tracks.push({ ...createTrack('overlay-track', 1), name: 'Overlay' });
    const region = bindMotionRegionToClip(
      {
        ...createVideoProjectMotionRegion(project, 1),
        border: createQuickEditBorder(),
        borderTarget: 'window',
      },
      first
    );
    project.motionRegions = [region];
    const props = createMotionPanelProps(region);
    props.project = project;
    props.selectedMotionRegion = region;
    props.onUpdateMotionRegion = vi.fn();
    props.onPreviewMotion = vi.fn();
    act(() => root?.render(<MotionFocusFields panel={props} motionRegion={region} />));
    for (const [clip, label] of [
      [first, 'Footage · Main (1)'],
      [second, `Footage · ${sameTrack ? 'Main' : 'Overlay'} (2)`],
    ] as const) {
      const button = container!.querySelector<HTMLButtonElement>(`[title="${label}"]`);
      expect(button).not.toBeNull();
      act(() => button!.click());
      expect(props.onPreviewMotion).toHaveBeenLastCalledWith(null);
      expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(region.id, {
        sourceClipId: clip.id,
        focusEdit: { kind: 'border' as const, target: 'window' },
      });
    }
  }
);

it('groups spotlight appearance and Native phases without dormant camera controls', () => {
  const props = createMotionPanelProps({
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport',
  });
  props.onUpdateMotionRegion = vi.fn();
  renderPanel(props);
  expect(container?.textContent).toContain('gallery.videoReview.focusOutside');
  expect(container?.textContent).toContain('videoEditor.sidebar.spotlightTarget');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.motionScaleLabel');
  expect(
    container?.querySelector('nav button[title="gallery.videoReview.perspective"]')
  ).toBeNull();
  expect(
    container?.querySelector('nav button[title="gallery.videoReview.depthOfField"]')
  ).toBeNull();
  expect(container?.querySelector('button[title="gallery.videoReview.focusDim"]')).toBeTruthy();
  expect(container?.querySelector('button[title="gallery.videoReview.focusBlur"]')).toBeTruthy();
  clickGroup('videoEditor.sidebar.inspectorGroupAnimation');
  expect(container?.textContent).not.toContain('gallery.videoReview.borderHold');
  expect(container?.textContent).not.toContain('gallery.videoReview.motionBlur');
  expect(
    container?.querySelectorAll('[aria-label="gallery.videoReview.focusReveal"]')
  ).toHaveLength(2);
});

it('previews spotlight strength, cancels and commits through the accepted Native snapshot', () => {
  const props = createMotionPanelProps({
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport',
  });
  props.onPreviewMotion = vi.fn();
  props.onUpdateMotionRegion = vi.fn();
  act(() =>
    root?.render(<MotionFocusFields panel={props} motionRegion={props.selectedMotionRegion!} />)
  );
  const slider = container!.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.focusStrength range"]'
  )!;
  expect(slider).toBeTruthy();
  const key = (type: string, key: string) =>
    act(() => slider.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
  key('keydown', 'ArrowRight');
  expect(props.onPreviewMotion).toHaveBeenLastCalledWith(
    expect.objectContaining({
      project: props.project,
      kind: 'focus',
      edit: { kind: 'spotlight', settings: { strength: expect.any(Number) } },
    })
  );
  expect(props.onUpdateMotionRegion).not.toHaveBeenCalled();
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(props.onPreviewMotion).toHaveBeenLastCalledWith(null);
  expect(props.onUpdateMotionRegion).not.toHaveBeenCalled();
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(props.onUpdateMotionRegion).toHaveBeenCalledExactlyOnceWith(
    props.selectedMotionRegion!.id,
    { focusEdit: { kind: 'spotlight', settings: { strength: expect.any(Number) } } }
  );
});

it.each(['window', 'scene'] as const)(
  'keeps %s coverage beside the concrete video and out of timing',
  (target) => {
    const clip = createVideoClip();
    const project = createProject([clip]);
    const region = bindMotionRegionToClip(
      {
        ...createVideoProjectMotionRegion(project, 1),
        spotlight: createQuickEditSpotlight(),
        spotlightTarget: target,
      },
      clip
    );
    project.motionRegions = [region];
    const props = createMotionPanelProps(region);
    props.project = project;
    props.selectedMotionRegion = region;
    props.onUpdateMotionRegion = vi.fn();
    renderPanel(props);
    const choice = container!.querySelector<HTMLButtonElement>(
      '[title="videoEditor.sidebar.spotlightCoverageScene"]'
    )!;
    expect(choice).toBeTruthy();
    act(() => choice.click());
    expect(props.onUpdateMotionRegion).toHaveBeenLastCalledWith(region.id, {
      focusEdit: { kind: 'spotlight', target: 'scene' },
    });
    clickGroup('videoEditor.sidebar.inspectorGroupTiming');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.framingBinding');
  }
);

it('keeps scene-plane controls out of the window camera inspector', () => {
  const props = createMotionPanelProps({
    sourceBinding: {
      clipId: 'window',
      coordinateSpace: 'source-window',
      sourceStart: 0,
      sourceEnd: 2,
      animation: { start: 0, end: 2, duration: 2 },
    },
  });
  renderPanel(props);
  expect(
    container!.querySelector('[aria-label="videoEditor.sidebar.inspectorGroupSpatialReference"]')
  ).toBeNull();
  const region = props.selectedMotionRegion!;
  const { sourceBinding: _binding, ...scene } = region;
  props.selectedMotionRegion = scene;
  props.project.motionRegions = [scene];
  renderPanel(props);
  expect(
    container!.querySelector('[aria-label="videoEditor.sidebar.inspectorGroupSpatialReference"]')
  ).not.toBeNull();
});

it('shows and edits link curves through compact choices', () => {
  const props = createMotionPanelProps();
  props.onUpdateMotionRegion = vi.fn();
  const first = { ...props.selectedMotionRegion!, id: 'from', startTime: 0, duration: 1 };
  const second = {
    ...first,
    id: 'to',
    startTime: 3,
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.EASE_IN_OUT },
  };
  props.project.motionRegions = [first, second];
  props.selection = { kind: 'motion-connection', motionRegionId: second.id };
  act(() => root?.render(<InspectMotionConnectionPanel {...props} />));
  const choices = [...container!.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
  expect(choices.find((item) => item.getAttribute('aria-pressed') === 'true')?.textContent).toBe(
    'videoEditor.sidebar.temporalEasingEaseInOut'
  );
  const none = choices.find(
    (item) => item.textContent === 'videoEditor.sidebar.temporalEasingLinear'
  )!;
  expect(none).toBeDefined();
  act(() => none.click());
  expect(props.onUpdateMotionRegion).toHaveBeenCalledExactlyOnceWith(second.id, {
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  });
});
