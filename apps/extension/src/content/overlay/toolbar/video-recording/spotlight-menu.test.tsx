// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RecordingSpotlightMenu } from './spotlight-menu';
import { DEFAULT_VIDEO_CURSOR_EFFECTS } from '@sniptale/runtime-contracts/video/types/types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('opens the categorized cursor panel without enabling effects or writing settings', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <RecordingSpotlightMenu
        compact={false}
        disabled={false}
        displayMode="horizontal"
        settings={{
          cursorHaloEnabled: false,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
        }}
        onChange={onChange}
      />
    )
  );
  const advanced = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.video-recording.cursor-settings"]'
  );
  expect(advanced).not.toBeNull();
  await act(async () => advanced?.click());
  expect(
    host.querySelector('[data-ui="content.toolbar.video-recording.cursor-panel"]')
  ).not.toBeNull();
  expect(
    host
      .querySelector('[data-ui="content.toolbar.video-recording.cursor-panel"]')
      ?.classList.contains('sniptale-inspector-surface')
  ).toBe(true);
  expect(host.querySelectorAll('nav button')).toHaveLength(4);
  expect(host.querySelectorAll('input[type="text"]')).toHaveLength(4);
  expect(onChange).not.toHaveBeenCalled();
  act(() => host.querySelectorAll<HTMLButtonElement>('nav button')[3]?.click());
  expect(
    host.querySelector('[data-ui="content.toolbar.video-recording.native-cursor"]')
  ).not.toBeNull();
  expect(host.querySelectorAll('input')).toHaveLength(0);
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        'button[title="content.interactiveFrame.closeEffectSettings"]'
      )
      ?.click()
  );
  expect(host.querySelector('[data-ui="content.toolbar.video-recording.cursor-panel"]')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('opens one canonical dropdown and changes halo, dimming, and click animation independently', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const cursorEffects = { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloColor: '#2563eb' };
  act(() =>
    root.render(
      <RecordingSpotlightMenu
        compact={false}
        disabled={false}
        displayMode="horizontal"
        settings={{
          cursorHaloEnabled: true,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
          cursorEffects,
        }}
        onChange={onChange}
      />
    )
  );

  await act(async () => {
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.spotlight"]')
      ?.click();
    await Promise.resolve();
  });
  expect(
    host.querySelector('[data-ui="content.toolbar.video-recording.spotlight-menu"]')
  ).not.toBeNull();
  expect(host.querySelector<HTMLElement>('.sniptale-popover-menu')?.style.top).toBe(
    'calc(100% + 10px)'
  );
  expect(
    host
      .querySelector('[data-ui="content.toolbar.video-recording.spotlight-halo"]')
      ?.classList.contains('sniptale-popover-item-selected')
  ).toBe(true);

  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.video-recording.spotlight-click"]'
      )
      ?.click()
  );
  expect(onChange).toHaveBeenCalledWith({
    cursorHaloEnabled: true,
    cursorDimmingEnabled: false,
    clickAnimationEnabled: true,
    cursorEffects,
  });
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.spotlight"]')
      ?.click();
    await Promise.resolve();
  });
  expect(
    host.querySelector('[data-ui="content.toolbar.video-recording.spotlight-menu"]')
  ).toBeNull();
  expect(document.activeElement).not.toBe(
    host.querySelector('[data-ui="content.toolbar.video-recording.spotlight"]')
  );
  act(() => root.unmount());
});

it('opens above a horizontal toolbar placed at the bottom viewport edge', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RecordingSpotlightMenu
        compact={false}
        disabled={false}
        displayMode="horizontal"
        settings={{
          cursorHaloEnabled: false,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
        }}
        onChange={vi.fn()}
      />
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.video-recording.spotlight"]'
  )!;
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    bottom: 758,
    height: 36,
    left: 500,
    right: 536,
    top: 722,
    width: 36,
    x: 500,
    y: 722,
    toJSON: () => ({}),
  });

  act(() => trigger.click());

  const menu = host.querySelector<HTMLElement>('.sniptale-popover-menu');
  expect(menu?.style.bottom).toBe('calc(100% + 10px)');
  expect(menu?.style.top).toBe('auto');
  act(() => root.unmount());
});

it('rolls an optimistic spotlight selection back when the command fails', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn().mockRejectedValue(new Error('surface unavailable'));
  act(() =>
    root.render(
      <RecordingSpotlightMenu
        compact={false}
        disabled={false}
        displayMode="horizontal"
        settings={{
          cursorHaloEnabled: false,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
        }}
        onChange={onChange}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.spotlight"]')
      ?.click()
  );
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.video-recording.spotlight-click"]'
      )
      ?.click();
    await Promise.resolve();
  });
  expect(
    host
      .querySelector('[data-ui="content.toolbar.video-recording.spotlight-click"]')
      ?.classList.contains('sniptale-popover-item-selected')
  ).toBe(false);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'content.toolbar.cursorEffectSaveFailed'
  );
  onChange.mockResolvedValueOnce(undefined);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.video-recording.spotlight-click"]'
      )
      ?.click()
  );
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(onChange).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

it('keeps quick cursor choices visually stable while admitting only one pending change', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finish!: () => void;
  const onChange = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RecordingSpotlightMenu
        compact={false}
        disabled={false}
        displayMode="horizontal"
        settings={{
          cursorHaloEnabled: false,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
        }}
        onChange={onChange}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.spotlight"]')!
      .click()
  );
  const menu = host.querySelector('[data-ui="content.toolbar.video-recording.spotlight-menu"]');
  const choices = [...host.querySelectorAll<HTMLButtonElement>('.sniptale-toolbar-menu-item')];
  act(() => {
    choices[0]!.click();
    choices[1]!.click();
  });
  expect(onChange).toHaveBeenCalledOnce();
  expect(choices[0]!.getAttribute('aria-pressed')).toBe('true');
  expect(choices[0]!.querySelector('svg.lucide-check')).not.toBeNull();
  expect(choices[1]!.querySelector('svg.lucide-check')).toBeNull();
  for (const choice of choices) {
    expect(choice.disabled).toBe(false);
    expect(choice.classList.contains('cursor-not-allowed')).toBe(false);
    expect(choice.classList.contains('opacity-50')).toBe(false);
  }
  expect(host.querySelector('[data-ui="content.toolbar.video-recording.spotlight-menu"]')).toBe(
    menu
  );
  await act(async () => {
    finish();
  });
  expect(host.querySelector('[data-ui="content.toolbar.video-recording.spotlight-menu"]')).toBe(
    menu
  );
  expect([...host.querySelectorAll('.sniptale-toolbar-menu-item')]).toEqual(choices);
  act(() => root.unmount());
});

it('keeps advanced controls stable while admitting only one pending cursor change', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const onChange = vi.fn(() => pending);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RecordingSpotlightMenu
        compact={false}
        disabled={false}
        displayMode="horizontal"
        settings={{
          cursorHaloEnabled: false,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
        }}
        onChange={onChange}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.video-recording.cursor-settings"]'
      )
      ?.click()
  );
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
  const panel = host.querySelector('[data-ui="content.toolbar.video-recording.cursor-panel"]');
  const controls = [...panel!.querySelectorAll('input, button')];
  act(() => {
    toggle.click();
    toggle.click();
  });
  expect(onChange).toHaveBeenCalledOnce();
  expect(toggle.disabled).toBe(false);
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  for (const control of controls) expect(control.hasAttribute('disabled')).toBe(false);
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  await act(async () => {
    finish();
    await pending;
  });
  expect(toggle.disabled).toBe(false);
  expect(host.querySelector('[data-ui="content.toolbar.video-recording.cursor-panel"]')).toBe(
    panel
  );
  expect([...panel!.querySelectorAll('input, button')]).toEqual(controls);
  expect(host.querySelector('[aria-busy="false"]')).not.toBeNull();
  act(() => root.unmount());
});
