// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewTimelineToolbar,
  ReviewModeControl,
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
  const render = async (
    mode: 'basic' | 'advanced',
    busy = false,
    selectedTrack: Parameters<
      typeof ReviewTimelineToolbar
    >[0]['selectedTrack'] = 'annotationEffects'
  ) => {
    advanced.ui.mode = mode;
    await act(async () =>
      root.render(
        <ReviewTimelineToolbar
          selectedTrack={selectedTrack}
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
    for (const track of ['text', 'voiceover', 'music', 'webcam', 'actions', null] as const) {
      await render('advanced', false, track);
      expect(button()).toBeNull();
      expect(host.querySelector('[data-ui="gallery.videoReview.trackToolHint"]')?.textContent).toBe(
        translate(
          track === null
            ? 'gallery.videoReview.noTrackSelected'
            : 'gallery.videoReview.trackActionsHint'
        )
      );
      expect(host.textContent).not.toContain(translate('gallery.videoReview.noTrackActions'));
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps one labelled mode control outside the track controls in both modes', async () => {
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
          <ReviewModeControl advanced={advanced} busy={busy} setMode={setMode} />
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
    expect(modeButton().closest('[data-ui="gallery.videoReview.trackControls"]')).toBeNull();
    expect(modeButton().textContent).toBe(translate('gallery.videoReview.advancedEditing'));
    expect(modeButton().getAttribute('aria-pressed')).toBe('false');
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenLastCalledWith('advanced');

    await render('advanced');
    const tracks = host.querySelector('[data-ui="gallery.videoReview.trackControls"]')!;
    expect(tracks.contains(modeButton())).toBe(false);
    expect(modeButton().textContent).toBe(translate('gallery.videoReview.advancedEditing'));
    expect(modeButton().getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-ui="gallery.videoReview.workspaceTools"]')).toBeNull();
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenLastCalledWith('basic');

    await render('advanced', true);
    expect(modeButton().disabled).toBe(true);
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenCalledTimes(2);

    await render('basic');
    expect(modeButton().closest('[data-ui="gallery.videoReview.trackControls"]')).toBeNull();
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
    expect(
      host.querySelector(`[aria-label="${translate('gallery.videoReview.advancedEditing')}"]`)
    ).toBeNull();
    expect(
      host.querySelector(`[aria-label="${translate('gallery.videoReview.telemetry')}"]`)
    ).toBeNull();
    expect(setTrackVisibility).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('offers five direct focus types, retains the choice, and preserves admission and busy guards', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  let admitted = true;
  let type: 'zoom' | 'spotlight' | 'lens' | 'border' | '3d' = 'zoom';
  const onToggle = vi.fn((next: typeof type) => {
    type = next;
  });
  const setCutting = vi.fn();
  const beforeAction = vi.fn((action: () => void) => {
    if (admitted) action();
  });
  const render = (active = false, busy = false) =>
    act(async () =>
      root.render(
        <ReviewTimelineToolbar
          selectedTrack="zoom"
          advanced={advanced}
          busy={busy}
          composerBusy={false}
          beforeAction={beforeAction}
          setMode={vi.fn()}
          setTrackVisibility={vi.fn()}
          telemetryAvailable
          selection={{ kind: 'point', time: 0 }}
          edits={[]}
          onDownloadFragment={vi.fn()}
          focusTool={{ active, type, available: true, onToggle }}
          editing={{
            mode: null,
            rate: 2,
            audio: 'speed',
            exporter: { index: null, phase: 'idle' },
            setCutting,
            toggle: vi.fn(),
            canApply: vi.fn(() => true),
            changeRate: vi.fn(),
            changeAudio: vi.fn(),
          }}
        />
      )
    );
  const options = [
    'zoomRegionLabel',
    'focusSpotlight',
    'focusLens',
    'focus3d',
    'focusBorder',
  ] as const;
  const button = (key: (typeof options)[number]) =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate(`gallery.videoReview.${key}`)}"]`
    )!;
  try {
    await render();
    expect(host.querySelectorAll('[data-ui="gallery.videoReview.focusTools"] button')).toHaveLength(
      5
    );
    expect(
      host.querySelector(`[aria-label="${translate('gallery.videoReview.focusType')}"]`)
    ).toBeNull();
    for (const [index, key] of options.entries()) {
      await act(async () => button(key).click());
      expect(onToggle).toHaveBeenLastCalledWith(
        (['zoom', 'spotlight', 'lens', '3d', 'border'] as const)[index]
      );
      await render(true);
      expect(button(key).getAttribute('aria-pressed')).toBe('true');
    }
    admitted = false;
    await act(async () => button('zoomRegionLabel').click());
    expect(onToggle).toHaveBeenCalledTimes(5);
    expect(beforeAction).toHaveBeenCalledTimes(6);
    admitted = true;
    await render(true, true);
    expect(button('focusLens').disabled).toBe(true);
    await act(async () => button('focusLens').click());
    expect(onToggle).toHaveBeenCalledTimes(5);
    await render(true);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[aria-label="${translate('gallery.videoReview.pointerTool')}"]`
        )!
        .click()
    );
    expect(setCutting).toHaveBeenCalledWith(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows the density control only in advanced mode without toggling tracks', async () => {
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
        expect(buttons).toHaveLength(mode === 'advanced' ? 1 : 0);
        if (mode === 'basic') {
          expect(host.querySelector('[data-ui="gallery.videoReview.trackControls"]')).toBeNull();
          continue;
        }
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
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(setTrackVisibility).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
