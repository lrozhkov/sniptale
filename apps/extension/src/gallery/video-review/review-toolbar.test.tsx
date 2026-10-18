// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewTimelineToolbar,
  ReviewTrackControls,
  type ReviewAnnotationTool,
} from './review-toolbar';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { translate } from '../../platform/i18n';

it('annotation addition is advanced-only, admitted through the note owner and blocked during busy phases', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  const toggle = vi.fn();
  const tool: ReviewAnnotationTool = {
    active: true,
    onToggle: toggle,
    value: 'title',
    options: [{ value: 'title', label: 'Title' }],
    phase: 'ready',
    pending: false,
    failure: null,
    retryable: true,
    onChoose: vi.fn(),
    onReload: vi.fn(),
    onRetry: vi.fn(),
  };
  let admitted: (() => void) | undefined;
  const render = async (mode: 'basic' | 'advanced', busy = false) => {
    advanced.ui.mode = mode;
    await act(async () =>
      root.render(
        <ReviewTimelineToolbar
          advanced={advanced}
          busy={busy}
          composerBusy={false}
          selection={{ kind: 'point', time: 0 }}
          edits={[]}
          annotationTool={tool}
          beforeAction={(action) => {
            admitted = action;
          }}
          setMode={vi.fn()}
          setTrackVisibility={vi.fn()}
          telemetryAvailable={false}
          onDownloadFragment={vi.fn()}
          editing={{
            mode: null,
            rate: 2,
            audio: 'speed',
            exporter: { index: null, phase: 'idle' },
            setCutting: vi.fn(),
            toggle: vi.fn(),
            canApply: vi.fn(() => true),
            changeRate: vi.fn(),
            changeAudio: vi.fn(),
          }}
        />
      )
    );
  };
  const button = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.annotationEffectsAdd')}"]`
    );
  try {
    await render('basic');
    expect(button()).toBeNull();
    await render('advanced');
    const trigger = button()!;
    expect(trigger.getAttribute('aria-pressed')).toBe('true');
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    expect(
      host.querySelector(
        `[aria-label="${translate('gallery.videoReview.annotationEffectsChoose')}"]`
      )
    ).not.toBeNull();
    expect(
      host
        .querySelector(`[aria-label="${translate('gallery.videoReview.pointerTool')}"]`)
        ?.getAttribute('aria-pressed')
    ).not.toBe('true');
    await act(async () => trigger.click());
    expect(toggle).not.toHaveBeenCalled();
    act(() => admitted?.());
    expect(toggle).toHaveBeenCalledExactlyOnceWith(trigger);
    await render('advanced', true);
    expect(button()?.disabled).toBe(true);
    await act(async () => button()?.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    const selector = () =>
      host.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('gallery.videoReview.annotationEffectsChoose')}"]`
      )!;
    tool.value = '';
    await render('advanced');
    expect(selector().getAttribute('aria-describedby')).toBeNull();
    expect(host.textContent).not.toContain(
      translate('gallery.videoReview.annotationEffectsRequired')
    );
    tool.phase = 'loading';
    tool.options = [];
    await render('advanced');
    expect(selector().disabled).toBe(true);
    expect(selector().hasAttribute('aria-describedby')).toBe(false);
    expect(selector().textContent).toContain(
      translate('gallery.videoReview.annotationEffectsLoading')
    );
    tool.phase = 'failed';
    await render('advanced');
    expect(selector().textContent).toContain(
      translate('gallery.videoReview.annotationEffectsCatalogFailed')
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[aria-label="${translate('gallery.videoReview.retry')}"]`
        )!
        .click()
    );
    expect(tool.onReload).toHaveBeenCalledOnce();
    tool.phase = 'ready';
    tool.options = [];
    await render('advanced');
    expect(selector().disabled).toBe(true);
    expect(selector().textContent).toContain(
      translate('gallery.videoReview.annotationEffectsCatalogEmpty')
    );
    tool.options = [{ value: 'title', label: 'Title' }];
    tool.pending = true;
    await render('advanced');
    expect(selector().disabled).toBe(true);
    expect(button()?.disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      translate('gallery.videoReview.annotationEffectsAdding')
    );
    tool.pending = false;
    tool.failure = translate('gallery.videoReview.annotationEffectsUnsupported');
    tool.retryable = false;
    await render('advanced');
    expect(host.querySelector('[role="alert"] button')).toBeNull();
    expect(selector().disabled).toBe(false);
    tool.failure = translate('gallery.videoReview.annotationEffectsAddFailed');
    tool.retryable = true;
    await render('advanced');
    await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(tool.onRetry).not.toHaveBeenCalled();
    act(() => admitted?.());
    expect(tool.onRetry).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('moves the mode switch between the labelled toolbar and first compact lane control', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  const setMode = vi.fn();
  const setTrackVisibility = vi.fn();
  const render = async (mode: 'basic' | 'advanced', busy = false) => {
    advanced.ui.mode = mode;
    const controls = { advanced, busy, setMode, setTrackVisibility, telemetryAvailable: true };
    await act(async () =>
      root.render(
        <>
          <ReviewTimelineToolbar
            {...controls}
            composerBusy={false}
            selection={{ kind: 'point', time: 0 }}
            edits={[]}
            onDownloadFragment={vi.fn()}
            editing={{
              mode: null,
              rate: 2,
              audio: 'speed',
              exporter: { index: null, phase: 'idle' },
              setCutting: vi.fn(),
              toggle: vi.fn(),
              canApply: vi.fn(() => true),
              changeRate: vi.fn(),
              changeAudio: vi.fn(),
            }}
          />
          <ReviewTrackControls {...controls} />
        </>
      )
    );
  };
  const modeButton = () => {
    const buttons = host.querySelectorAll<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.advancedEditing')}"]`
    );
    expect(buttons).toHaveLength(1);
    return buttons[0]!;
  };
  try {
    await render('basic');
    expect(modeButton().closest('[data-ui="gallery.videoReview.workspaceTools"]')).not.toBeNull();
    expect(modeButton().textContent).toBe(translate('gallery.videoReview.advancedEditing'));
    expect(modeButton().getAttribute('aria-pressed')).toBe('false');
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenLastCalledWith('advanced');

    await render('advanced');
    const tracks = host.querySelector('[data-ui="gallery.videoReview.trackControls"]')!;
    expect(tracks.querySelector('button')).toBe(modeButton());
    expect(modeButton().textContent).toBe('');
    expect(modeButton().getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-ui="gallery.videoReview.workspaceTools"]')).toBeNull();
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenLastCalledWith('basic');

    await render('advanced', true);
    expect(modeButton().disabled).toBe(true);
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenCalledTimes(2);

    await render('basic');
    expect(modeButton().closest('[data-ui="gallery.videoReview.workspaceTools"]')).not.toBeNull();
    expect(modeButton().textContent).toBe(translate('gallery.videoReview.advancedEditing'));
    expect(host.querySelector('[data-ui="gallery.videoReview.trackControls"]')).toBeNull();
    expect(setTrackVisibility).not.toHaveBeenCalled();
    expect(host.querySelector('[data-ui="gallery.videoReview.editingTools"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps track settings quiet while preserving active and focus states', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.ui.tracks.audio = true;
  const setTrackVisibility = vi.fn();
  const toggle = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControls
          settings={{ active: true, toggle }}
          advanced={advanced}
          busy={false}
          setMode={vi.fn()}
          setTrackVisibility={setTrackVisibility}
          telemetryAvailable
        />
      )
    );
    const button = host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.trackSettings')}"]`
    )!;
    expect(button.className).not.toContain('enabled:hover:!border-');
    expect(button.className).toContain('enabled:hover:!text-');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button.click());
    expect(toggle).toHaveBeenCalledOnce();
    const mode = host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.advancedEditing')}"]`
    )!;
    expect(mode.className).not.toContain('enabled:hover:!border-');
    expect(
      host.querySelector(`[aria-label="${translate('gallery.videoReview.telemetry')}"]`)
    ).toBeNull();
    expect(setTrackVisibility).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows the Focus type only while Focus is active and retains the insertion choice', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  let kind: 'zoom' | 'spotlight' | 'border' | undefined;
  let admitted = true;
  const onToggle = vi.fn();
  const setCutting = vi.fn();
  const toggle = vi.fn();
  const changeRate = vi.fn();
  const changeAudio = vi.fn();
  const onType = vi.fn((value: 'zoom' | 'spotlight' | 'border') => {
    kind = value;
  });
  const beforeAction = vi.fn((action: () => void) => {
    if (admitted) action();
  });
  const render = (active: boolean, busy = false) =>
    act(async () =>
      root.render(
        <ReviewTimelineToolbar
          advanced={advanced}
          busy={busy}
          beforeAction={beforeAction}
          composerBusy={false}
          setMode={vi.fn()}
          setTrackVisibility={vi.fn()}
          telemetryAvailable
          selection={{ kind: 'point', time: 0 }}
          edits={[]}
          onDownloadFragment={vi.fn()}
          focusTool={{ active, available: true, ...(kind ? { type: kind } : {}), onType, onToggle }}
          editing={{
            mode: active ? null : 'speed',
            rate: 2,
            audio: 'speed',
            exporter: {
              index: {
                duration: 6,
                boundaries: [0, 6],
                videoCodec: 'vp8',
                audioCodec: null,
                container: 'webm',
                rotation: 0,
              },
              phase: 'idle',
            },
            setCutting,
            toggle,
            canApply: vi.fn(() => true),
            changeRate,
            changeAudio,
          }}
        />
      )
    );
  const selector = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.focusType')}"]`
    );
  const choose = async (label: string) => {
    await act(async () => selector()!.click());
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (node) => node.textContent?.includes(label)
    )!;
    expect(option).toBeDefined();
    await act(async () => option.click());
  };
  const click = async (key: Parameters<typeof translate>[0]) =>
    act(async () =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${translate(key)}"]`)!.click()
    );
  const speedOption = async (key: Parameters<typeof translate>[0], label: string) => {
    await click(key);
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((node) => node.textContent === label)!
        .click()
    );
  };
  try {
    await render(false);
    await click('gallery.videoReview.focusRangeTool');
    expect(onToggle).toHaveBeenCalledOnce();
    await click('gallery.videoReview.pointerTool');
    expect(setCutting).toHaveBeenCalledWith(false);
    await click('gallery.videoReview.speedMode');
    expect(toggle).toHaveBeenCalledWith('speed');
    await speedOption('gallery.videoReview.speedRate', '4×');
    expect(changeRate).toHaveBeenCalledWith(4);
    await speedOption('gallery.videoReview.speedAudio', translate('gallery.videoReview.muteSound'));
    expect(changeAudio).toHaveBeenCalledWith('mute');
    beforeAction.mockClear();
    expect(selector()).toBeNull();
    await render(true);
    expect(selector()?.textContent).toContain(translate('gallery.videoReview.zoomRegionLabel'));
    await choose(translate('gallery.videoReview.focusSpotlight'));
    expect(onType).toHaveBeenLastCalledWith('spotlight');
    await render(true);
    await choose(translate('gallery.videoReview.focusBorder'));
    expect(onType).toHaveBeenLastCalledWith('border');
    await render(false);
    expect(selector()).toBeNull();
    await render(true);
    expect(selector()?.textContent).toContain(translate('gallery.videoReview.focusBorder'));
    admitted = false;
    await choose(translate('gallery.videoReview.zoomRegionLabel'));
    expect(onType).toHaveBeenCalledTimes(2);
    expect(beforeAction).toHaveBeenCalledTimes(3);
    admitted = true;
    await choose(translate('gallery.videoReview.zoomRegionLabel'));
    expect(onType).toHaveBeenLastCalledWith('zoom');
    await render(true, true);
    expect(selector()?.disabled).toBe(true);
    await act(async () => selector()!.click());
    expect(document.querySelector('[role="option"]')).toBeNull();
    expect(onType).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps one global density control available in both editing modes without toggling tracks', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  const onToggle = vi.fn();
  const setTrackVisibility = vi.fn();
  try {
    for (const mode of ['basic', 'advanced'] as const) {
      advanced.ui.mode = mode;
      for (const compact of [false, true]) {
        await act(async () =>
          root.render(
            <ReviewTrackControls
              advanced={advanced}
              busy={false}
              setMode={vi.fn()}
              setTrackVisibility={setTrackVisibility}
              telemetryAvailable
              density={{ compact, onToggle }}
            />
          )
        );
        const buttons = host.querySelectorAll<HTMLButtonElement>(
          `[aria-label="${translate('gallery.videoReview.compactTrackHeight')}"]`
        );
        expect(buttons).toHaveLength(1);
        expect(buttons[0]!.title).toBe(
          translate(
            compact
              ? 'gallery.videoReview.normalTrackHeight'
              : 'gallery.videoReview.compactTrackHeight'
          )
        );
        expect(buttons[0]!.getAttribute('aria-pressed')).toBe(String(compact));
        await act(async () => buttons[0]!.click());
      }
    }
    expect(onToggle).toHaveBeenCalledTimes(4);
    expect(setTrackVisibility).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
