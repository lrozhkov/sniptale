// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultFrameStepBadge } from '../../../features/highlighter/frame-annotation/defaults';

const controller = vi.hoisted(() => ({
  catalog: {
    create: vi.fn(async () => ({ id: 'created', outcome: 'applied' })),
    error: null,
    pending: new Set<string>(),
    presets: [],
    refresh: vi.fn(),
    reset: vi.fn(),
    toggle: vi.fn(),
    update: vi.fn(async () => ({ outcome: 'applied' })),
    value: null,
    visiblePresets: [],
  },
  editor: {
    close: vi.fn(),
    isOpen: false,
    isSaving: false,
    open: vi.fn(),
    reset: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('./preset-controller', () => ({
  useStepBadgePresetPopoverController: () => controller,
}));

import { FutureStepBadgeSettingsPopover } from './popover';

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('projects optional template-source and reorder controls through the future popover', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const portal = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(host, portal, anchor);
  const root = createRoot(host);
  const onSourceChange = vi.fn();
  const onReorder = vi.fn();

  act(() =>
    root.render(
      <FutureStepBadgeSettingsPopover
        anchorEl={anchor}
        frameVisuals={{ borderColor: '#f97316', borderWidth: 2 }}
        headerContext="element"
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        onReorder={onReorder}
        portalTarget={portal}
        settings={{ ...createDefaultFrameStepBadge(), auto: false }}
        templateSourceControl={{ onChange: onSourceChange, value: 'frame-default' }}
      />
    )
  );

  const source = portal.querySelector<HTMLButtonElement>('.sniptale-settings-popover-mode-action');
  act(() => source?.click());
  expect(onSourceChange).toHaveBeenCalledWith('forced');
  expect(
    portal.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]')
  ).not.toBeNull();

  act(() => root.unmount());
});
