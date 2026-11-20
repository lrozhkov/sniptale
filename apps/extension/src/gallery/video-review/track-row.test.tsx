// @vitest-environment jsdom
import { act, forwardRef, Profiler, Suspense, startTransition, useState } from 'react';
import { Eye, EyeOff, Volume2, type LucideProps } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import * as i18n from '../../platform/i18n';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  ReviewTrackControlsProvider,
  ReviewTrackRow,
  ReviewTrackVisibilityButton,
} from './track-row';

vi.mock('../../platform/i18n/catalog-transport', async (original) => {
  const actual = await original<typeof import('../../platform/i18n/catalog-transport')>();
  const { catalogFixtureMessages } =
    await import('../../platform/i18n/catalog-fixture.test-support');
  return {
    ...actual,
    loadCatalogMessages: async (locale: i18n.AppLocale) => catalogFixtureMessages(locale),
  };
});

it('keeps a checked unavailable source switch in the settings grid and removes lock commands', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.lockedTracks = { source: true };
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: true,
            busy: false,
            unavailable: {},
            setEnabled: vi.fn(),
          }}
        >
          <ReviewTrackRow track="source" label="Source">
            <div />
          </ReviewTrackRow>
        </ReviewTrackControlsProvider>
      )
    );
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(toggle?.dataset['reviewHint']).toBe(
      i18n.translate('gallery.videoReview.sourceTrackAlwaysEnabled')
    );
    expect(host.querySelector('[data-review-track-locked="true"]')).toBeNull();
    expect(
      host.querySelectorAll('[aria-label*="trackLock"],[aria-label*="trackUnlock"]')
    ).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps full-header selection separate from mini actions and lane switches', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.zoom = true;
  const action = vi.fn();
  const enabled = vi.fn();
  function Fixture() {
    const [selected, select] = useState<'source' | 'zoom'>('source');
    return (
      <ReviewTrackControlsProvider
        value={{
          ui: advanced.ui,
          configuring: true,
          busy: false,
          unavailable: {},
          setEnabled: enabled,
          selectedTrack: selected,
          selectTrack: (track) => {
            if (track === 'source' || track === 'zoom') select(track);
          },
        }}
      >
        <ReviewTrackRow track="source" label="Source">
          <div />
        </ReviewTrackRow>
        <ReviewTrackRow
          track="zoom"
          label="Focus"
          controls={<button onClick={action}>Mini action</button>}
        >
          <div />
        </ReviewTrackRow>
      </ReviewTrackControlsProvider>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    const source = host.querySelector<HTMLElement>('[data-review-header-track="source"]')!;
    const focus = host.querySelector<HTMLElement>('[data-review-header-track="zoom"]')!;
    expect(source.getAttribute('data-review-header-selected')).toBe('true');
    await act(async () =>
      [...focus.querySelectorAll('button')]
        .find((node) => node.textContent === 'Mini action')!
        .click()
    );
    expect(action).toHaveBeenCalledOnce();
    expect(source.getAttribute('data-review-header-selected')).toBe('true');
    await act(async () =>
      focus.querySelector<HTMLButtonElement>('[data-review-track-select]')!.click()
    );
    expect(source.getAttribute('data-review-header-selected')).toBe('false');
    expect(focus.getAttribute('data-review-header-selected')).toBe('true');
    expect(focus.querySelector('[data-review-track-select]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
    await act(async () => focus.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(enabled).toHaveBeenCalledWith('zoom', false);
    expect(focus.getAttribute('data-review-header-selected')).toBe('true');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('selects an empty lane before its gesture without consuming controls, items or the surrounding gap', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.text = true;
  const select = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: false,
            busy: false,
            unavailable: {},
            setEnabled: vi.fn(),
            selectedTrack: 'source',
            selectTrack: select,
          }}
        >
          <ReviewTrackRow track="text" label="Text">
            <div data-empty-lane>
              <button>Existing control</button>
              <div role="button">Existing fragment</div>
            </div>
          </ReviewTrackRow>
          <div data-lane-gap />
        </ReviewTrackControlsProvider>
      )
    );
    const pointer = async (node: Element, button = 0) =>
      act(async () => {
        node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button }));
      });
    await pointer(host.querySelector('[data-empty-lane]')!);
    expect(select).toHaveBeenCalledExactlyOnceWith('text');
    select.mockClear();
    await pointer(host.querySelector('[data-empty-lane] button')!);
    await pointer(host.querySelector('[role="button"]')!);
    await pointer(host.querySelector('[data-lane-gap]')!);
    await pointer(host.querySelector('[data-empty-lane]')!, 2);
    expect(select).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('allows creation-track selection while its master is off in configuration mode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.voiceover = false;
  const select = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: true,
            busy: false,
            unavailable: {},
            setEnabled: vi.fn(),
            selectedTrack: 'source',
            selectTrack: select,
            selectable: { voiceover: true },
          }}
        >
          <ReviewTrackRow track="voiceover" label="Voiceover">
            <div data-empty-lane />
          </ReviewTrackRow>
        </ReviewTrackControlsProvider>
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[data-review-track-select]')!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(select).toHaveBeenCalledExactlyOnceWith('voiceover');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('publishes only the affected lane flags while commands read the latest committed receiver', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.music = true;
  const commits = vi.fn();
  const first = vi.fn();
  const latest = vi.fn();
  const children = (
    <Profiler id="music" onRender={commits}>
      <ReviewTrackRow track="music" label="Music">
        <div />
      </ReviewTrackRow>
    </Profiler>
  );
  const value = {
    ui: advanced.ui,
    configuring: true,
    busy: false,
    unavailable: {},
    selectedTrack: 'source' as const,
    selectTrack: first,
    setEnabled: vi.fn(),
  };
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider value={value}>{children}</ReviewTrackControlsProvider>
      )
    );
    commits.mockClear();
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ...value,
            selectTrack: latest,
            ui: { ...value.ui, tracks: { ...value.ui.tracks, annotationEffects: false } },
          }}
        >
          {children}
        </ReviewTrackControlsProvider>
      )
    );
    expect(commits).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{ ...value, selectedTrack: 'zoom', selectTrack: latest }}
        >
          {children}
        </ReviewTrackControlsProvider>
      )
    );
    expect(commits).not.toHaveBeenCalled();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-review-track-select]')!.click()
    );
    expect(latest).toHaveBeenCalledExactlyOnceWith('music');
    expect(first).not.toHaveBeenCalled();
    commits.mockClear();
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{ ...value, selectedTrack: 'music', selectTrack: latest }}
        >
          {children}
        </ReviewTrackControlsProvider>
      )
    );
    expect(
      host
        .querySelector('[data-review-header-track="music"]')
        ?.getAttribute('data-review-header-selected')
    ).toBe('true');
    expect(commits).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it.each(['annotationEffects', 'text'] as const)(
  'changes %s visibility in both directions without committing unrelated lane controls',
  async (track) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const advanced = createQuickEditAdvancedState();
    const otherCommits = vi.fn();
    const rows = (
      <>
        <ReviewTrackRow track={track} label="Target">
          <div />
        </ReviewTrackRow>
        <Profiler id="unrelated" onRender={otherCommits}>
          <ReviewTrackRow track="music" label="Music">
            <div />
          </ReviewTrackRow>
          <ReviewTrackRow track="source" label="Source">
            <div />
          </ReviewTrackRow>
        </Profiler>
      </>
    );
    function Fixture() {
      const [enabled, setEnabled] = useState(true);
      return (
        <ReviewTrackControlsProvider
          value={{
            ui: { ...advanced.ui, tracks: { ...advanced.ui.tracks, [track]: enabled } },
            configuring: true,
            busy: false,
            unavailable: {},
            setEnabled: (_track, next) => setEnabled(next),
          }}
        >
          {rows}
        </ReviewTrackControlsProvider>
      );
    }
    try {
      await act(async () => root.render(<Fixture />));
      const toggle = host.querySelector<HTMLButtonElement>(
        `[data-review-header-track="${track}"] [role="switch"]`
      )!;
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(otherCommits).toHaveBeenCalled();
      otherCommits.mockClear();
      for (const expected of ['false', 'true']) {
        await act(async () => toggle.click());
        expect(toggle.getAttribute('aria-checked')).toBe(expected);
        expect(otherCommits).not.toHaveBeenCalled();
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

it('retains header identity during fresh lane and action updates while commands stay live', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.music = true;
  const translations = vi.spyOn(i18n, 'translate');
  const iconRenders = vi.fn();
  const Icon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
    iconRenders();
    return <svg {...props} ref={ref} data-header-icon="first" />;
  });
  const OtherIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
    <svg {...props} ref={ref} data-header-icon="other" />
  ));
  let icon = Icon;
  let muted = false;
  let label = '3D';
  let configuring = true;
  let busy = false;
  let unavailable = false;
  let selectedTrack: import('../../features/video/review/advanced/types').QuickEditTrack = 'source';
  const first = vi.fn();
  const latest = vi.fn();
  let action = first;
  let receiver = first;
  let revision = 0;
  const render = () =>
    act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring,
            busy,
            selectedTrack,
            unavailable: { music: unavailable },
            setEnabled: receiver,
            selectTrack: receiver,
          }}
        >
          <ReviewTrackRow
            track="music"
            label={label}
            icon={icon}
            muted={muted}
            controls={
              <button data-live-action onClick={action}>
                Action {revision}
              </button>
            }
          >
            <div>Lane {revision}</div>
          </ReviewTrackRow>
        </ReviewTrackControlsProvider>
      )
    );
  try {
    await render();
    const header = host.querySelector('[data-review-header-track="music"]');
    const identities = () =>
      translations.mock.calls.filter(([key]) => key === 'gallery.videoReview.trackEnabled').length;
    const initial = identities();
    expect(initial).toBeGreaterThan(0);
    const initialIcons = iconRenders.mock.calls.length;
    action = latest;
    receiver = latest;
    revision = 1;
    await render();
    expect.soft(identities()).toBe(initial);
    expect(iconRenders).toHaveBeenCalledTimes(initialIcons);
    expect(host.querySelector('[data-review-header-track="music"]')).toBe(header);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-live-action]')!.click());
    expect(latest).toHaveBeenCalledOnce();
    latest.mockClear();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-review-track-select]')!.click()
    );
    expect(latest).toHaveBeenCalledExactlyOnceWith('music');
    expect(first).not.toHaveBeenCalled();
    icon = OtherIcon;
    await render();
    expect(host.querySelector('[data-header-icon="other"]')).not.toBeNull();
    muted = true;
    await render();
    expect(header?.getAttribute('data-review-header-muted')).toBe('true');
    label = 'New label';
    await render();
    expect(host.querySelector('[data-track-label]')?.textContent).toBe(label);
    configuring = false;
    await render();
    expect(host.querySelector('[role="switch"]')).toBeNull();
    configuring = true;
    busy = true;
    await render();
    expect(host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-review-track-select]')!.disabled).toBe(
      true
    );
    busy = false;
    unavailable = true;
    await render();
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('[role="switch"]')?.getAttribute('data-review-hint')).toBe(
      i18n.translate('gallery.videoReview.trackUnavailable')
    );
    unavailable = false;
    advanced.ui = { ...advanced.ui, tracks: { ...advanced.ui.tracks, music: false } };
    await render();
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    advanced.ui = { ...advanced.ui, tracks: { ...advanced.ui.tracks, music: true } };
    selectedTrack = 'music';
    await render();
    expect(host.querySelector('[data-review-track-select]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    translations.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('refreshes configuration labels and tooltips on locale change with an unchanged track label', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const original = i18n.getCurrentLocale();
  await i18n.prepareTranslations('gallery', original);
  const advanced = createQuickEditAdvancedState();
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: true,
            busy: false,
            unavailable: { zoom: true },
            setEnabled: vi.fn(),
          }}
        >
          <ReviewTrackRow track="zoom" label="3D">
            <div />
          </ReviewTrackRow>
        </ReviewTrackControlsProvider>
      )
    );
    const toggle = host.querySelector('[role="switch"]')!;
    const label = toggle.getAttribute('aria-label');
    const hint = toggle.getAttribute('data-review-hint');
    await act(async () => i18n.setLocalePreference(original === 'en' ? 'ru' : 'en'));
    expect(host.querySelector('[data-track-label]')?.textContent).toBe('3D');
    expect(toggle.getAttribute('aria-label')).toBe(
      `${i18n.translate('gallery.videoReview.trackEnabled')}: 3D`
    );
    expect(toggle.getAttribute('aria-label')).not.toBe(label);
    expect(toggle.getAttribute('data-review-hint')).toBe(
      i18n.translate('gallery.videoReview.trackUnavailable')
    );
    expect(toggle.getAttribute('data-review-hint')).not.toBe(hint);
  } finally {
    await act(async () => root.unmount());
    await i18n.setLocalePreference(original);
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps arbitrary ruler content live when its callback changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const first = vi.fn();
  const latest = vi.fn();
  const render = (action: () => void) =>
    act(async () =>
      root.render(
        <ReviewTrackRow ruler label="" rulerContent={<button onClick={action}>Ruler tools</button>}>
          <div />
        </ReviewTrackRow>
      )
    );
  try {
    await render(first);
    const button = host.querySelector<HTMLButtonElement>('button')!;
    await render(latest);
    expect(host.querySelector('button')).toBe(button);
    await act(async () => button.click());
    expect(latest).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('retains visibility presentation for unchanged visuals while its toggle callback changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const renders = vi.fn();
  const Icon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
    renders();
    return <svg {...props} ref={ref} data-visibility-icon />;
  });
  const first = vi.fn();
  const latest = vi.fn();
  const render = (onToggle: () => void) =>
    act(async () =>
      root.render(
        <ReviewTrackVisibilityButton
          track="zoom"
          label="Visibility"
          enabled
          icon={Icon}
          className="lane-action"
          onToggle={onToggle}
        />
      )
    );
  try {
    await render(first);
    const initial = renders.mock.calls.length;
    expect(initial).toBeGreaterThan(0);
    const button = host.querySelector<HTMLButtonElement>('button')!;
    await render(latest);
    expect.soft(renders).toHaveBeenCalledTimes(initial);
    expect(host.querySelector('button')).toBe(button);
    await act(async () => button.click());
    expect(latest).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('dispatches visibility commands only through the latest committed receiver across a suspended render', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const committed = vi.fn();
  const abandoned = vi.fn();
  const latest = vi.fn();
  const attempted = vi.fn();
  const pending = new Promise<void>(() => {});
  function Wait({ suspend }: { suspend: boolean }) {
    if (suspend) {
      attempted();
      throw pending;
    }
    return null;
  }
  const view = (onToggle: () => void, suspend: boolean) => (
    <Suspense fallback={<div data-waiting />}>
      <ReviewTrackVisibilityButton
        track="zoom"
        label="Visibility"
        enabled
        icon={Eye}
        onToggle={onToggle}
      />
      <Wait suspend={suspend} />
    </Suspense>
  );
  try {
    await act(async () => root.render(view(committed, false)));
    const button = host.querySelector<HTMLButtonElement>('button')!;
    await act(async () => {
      startTransition(() => root.render(view(abandoned, true)));
    });
    expect(attempted).toHaveBeenCalled();
    expect(host.querySelector('[data-waiting]')).toBeNull();
    expect(host.querySelector('button')).toBe(button);
    await act(async () => button.click());
    expect(committed).toHaveBeenCalledOnce();
    expect(abandoned).not.toHaveBeenCalled();
    await act(async () => root.render(view(latest, false)));
    expect(host.querySelector('button')).toBe(button);
    await act(async () => {
      button.focus();
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(latest).not.toHaveBeenCalled();
    // jsdom does not synthesize the browser's native keyboard click.
    await act(async () => button.click());
    await act(async () =>
      button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    );
    expect(latest).toHaveBeenCalledOnce();
    expect(committed).toHaveBeenCalledOnce();
    expect(abandoned).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('updates visibility glyphs, flags and labels without bypassing lane master availability', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.zoom = true;
  const toggle = vi.fn();
  let enabled = true;
  let icon = Eye;
  let disabled = false;
  let unavailable = false;
  let label = 'Apply camera';
  let className = 'first-action';
  const render = () =>
    act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: true,
            busy: false,
            unavailable: { zoom: unavailable },
            setEnabled: vi.fn(),
          }}
        >
          <ReviewTrackVisibilityButton
            track="zoom"
            label={label}
            enabled={enabled}
            icon={icon}
            disabled={disabled}
            className={className}
            onToggle={toggle}
          />
        </ReviewTrackControlsProvider>
      )
    );
  try {
    await render();
    const button = host.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.dataset['reviewHint']).toBe(i18n.translate('gallery.videoReview.hideFromVideo'));
    expect(button.querySelector('.lucide-eye')).not.toBeNull();
    enabled = false;
    icon = EyeOff;
    await render();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('.lucide-eye-off')).not.toBeNull();
    disabled = true;
    icon = Volume2;
    label = 'Empty audio';
    className = 'latest-action';
    await render();
    expect(button.disabled).toBe(true);
    expect(button.querySelector('.lucide-volume-2')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe(label);
    expect(button.dataset['reviewHint']).toBe(i18n.translate('gallery.videoReview.showInVideo'));
    expect(button.classList.contains(className)).toBe(true);
    await act(async () => button.click());
    expect(toggle).not.toHaveBeenCalled();
    disabled = false;
    unavailable = true;
    await render();
    expect(button.disabled).toBe(true);
    unavailable = false;
    advanced.ui = { ...advanced.ui, tracks: { ...advanced.ui.tracks, zoom: false } };
    await render();
    expect(button.disabled).toBe(true);
    advanced.ui = { ...advanced.ui, tracks: { ...advanced.ui.tracks, zoom: true } };
    await render();
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(toggle).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('receives changed authored visibility labels through the real caller locale subscription', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const original = i18n.getCurrentLocale();
  await i18n.prepareTranslations('gallery', original);
  function Caller() {
    const locale = i18n.useAppLocale();
    return (
      <ReviewTrackVisibilityButton
        track="zoom"
        label={i18n.translate('gallery.videoReview.zoomEnabled', locale)}
        enabled
        icon={Eye}
        onToggle={vi.fn()}
      />
    );
  }
  try {
    await act(async () => root.render(<Caller />));
    const button = host.querySelector<HTMLButtonElement>('button')!;
    const label = button.getAttribute('aria-label');
    await act(async () => i18n.setLocalePreference(original === 'en' ? 'ru' : 'en'));
    expect(button.getAttribute('aria-label')).not.toBe(label);
    expect(button.getAttribute('aria-label')).toBe(
      i18n.translate('gallery.videoReview.zoomEnabled')
    );
    expect(button.dataset['reviewHint']).toBe(i18n.translate('gallery.videoReview.hideFromVideo'));
  } finally {
    await act(async () => root.unmount());
    await i18n.setLocalePreference(original);
    vi.unstubAllGlobals();
  }
});
