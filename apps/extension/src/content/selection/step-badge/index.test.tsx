// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => (key === 'content.stepBadge.tooltipPrefix' ? 'Step' : key),
}));

import { StepBadge } from '.';
import { createStepBadgeSettingsFixture } from '../frame-runtime/test-support';

it('renders the tooltip label through the shared i18n seam', () => {
  const markup = renderToStaticMarkup(
    <StepBadge
      settings={createStepBadgeSettingsFixture({ value: '7' })}
      borderColor="#000"
      borderWidth={2}
      zIndex={10}
    />
  );

  expect(markup).toContain('title="Step 7"');
});

it('renders hover-only move and settings controls for an enabled badge', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
        isSettingsOpen
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle
        zIndex={10}
      />
    );
  });

  expect(document.querySelector('.sniptale-step-badge-move-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  expect(document.querySelector('.sniptale-step-badge-settings-handle')).toBeInstanceOf(
    HTMLButtonElement
  );

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('keeps closed controls keyboard-reachable and reveals them on focus', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSettingsClick = vi.fn();

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
        onPositionChange={vi.fn()}
        onSettingsClick={onSettingsClick}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle
        zIndex={10}
      />
    );
  });

  const moveHandle = document.querySelector<HTMLButtonElement>('.sniptale-step-badge-move-handle');
  const settingsHandle = document.querySelector<HTMLButtonElement>(
    '.sniptale-step-badge-settings-handle'
  );
  const controls = document.querySelector<HTMLElement>('.sniptale-step-badge-controls');

  expect(moveHandle).toBeInstanceOf(HTMLButtonElement);
  expect(settingsHandle).toBeInstanceOf(HTMLButtonElement);
  expect(controls?.style.opacity).toBe('0');

  act(() => moveHandle?.focus());
  expect(controls?.style.opacity).toBe('1');

  act(() => settingsHandle?.click());
  expect(onSettingsClick).toHaveBeenCalledOnce();

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('hides only the quick settings button while a main toolbar owns the frame UI', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
        isSettingsOpen
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle={false}
        zIndex={10}
      />
    );
  });

  expect(document.querySelector('.sniptale-step-badge-move-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  expect(document.querySelector('.sniptale-step-badge-settings-handle')).toBeNull();

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('reanchors move and settings controls after scroll updates the frame geometry', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let badgeRect = new DOMRect(100, 80, 30, 30);
  const rectSpy = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      return this.classList.contains('sniptale-step-badge') ? badgeRect : new DOMRect();
    });
  const settings = createStepBadgeSettingsFixture({ value: '7' });
  const renderBadge = (frameY: number) => {
    root.render(
      <StepBadge
        settings={settings}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: frameY }}
        isSettingsOpen
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle
        zIndex={10}
      />
    );
  };

  act(() => renderBadge(80));
  const controls = document.querySelector<HTMLElement>('.sniptale-step-badge-controls');
  expect(controls?.style.top).toBe('70px');

  act(() => window.dispatchEvent(new Event('scroll')));
  badgeRect = new DOMRect(100, 30, 30, 30);
  act(() => renderBadge(30));

  expect(controls?.style.top).toBe('20px');
  expect(controls?.querySelector('.sniptale-step-badge-move-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  expect(controls?.querySelector('.sniptale-step-badge-settings-handle')).toBeInstanceOf(
    HTMLButtonElement
  );

  rectSpy.mockRestore();
  act(() => root.unmount());
  document.body.replaceChildren();
});
