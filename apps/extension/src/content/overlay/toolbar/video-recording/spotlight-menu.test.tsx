// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RecordingSpotlightMenu } from './spotlight-menu';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('opens one canonical dropdown and changes halo, dimming, and click animation independently', async () => {
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
          cursorHaloEnabled: true,
          cursorDimmingEnabled: false,
          clickAnimationEnabled: false,
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
  act(() => root.unmount());
});
