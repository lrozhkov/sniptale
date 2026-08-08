// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createCalloutSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/test-support';
import { InteractiveFrameToolbarContent } from './view';
import type { InteractiveFrameToolbarProps } from './types';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('delegates selected-frame capture visibility to the shared floating state', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onUpdate = vi.fn();
  const frame = createFrameDataFixture('frame-1');
  const props = {
    calloutPopoverAnchorRef: { current: null },
    captureVisibility: {
      hiddenDuringCapture: false,
      toggle: vi.fn(),
    },
    clearSelection: vi.fn(),
    closePopover: vi.fn(),
    effectMode: 'border',
    frame,
    handleDelete: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleStartEditing: vi.fn(),
    isCalloutEditing: false,
    isSelected: true,
    onUpdate,
    popoverAnchorRef: { current: null },
    setIsCalloutEditing: vi.fn(),
    setState: vi.fn(),
    state: 'hover',
    stepBadgePopoverAnchorRef: { current: null },
    toolbarAnchorOffset: null,
    toolbarCoords: { x: 20, y: 20 },
    togglePopover: vi.fn(),
  } satisfies InteractiveFrameToolbarProps;
  act(() => root.render(<InteractiveFrameToolbarContent toolbarProps={props} />));
  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.interactive-frame.capture-visibility"]'
  );

  expect(button?.getAttribute('aria-pressed')).toBe('false');
  expect(button?.querySelector('.lucide-eye')).not.toBeNull();
  act(() => button?.click());
  expect(props.captureVisibility.toggle).toHaveBeenCalledOnce();
  expect(onUpdate).not.toHaveBeenCalled();
  expect(
    container.querySelectorAll('[data-ui="content.interactive-frame.add-callout"]')
  ).toHaveLength(0);

  act(() =>
    root.render(
      <InteractiveFrameToolbarContent
        toolbarProps={{
          ...props,
          frame: createFrameDataFixture('frame-1', {
            callout: createCalloutSettingsFixture(),
          }),
        }}
      />
    )
  );
  const addCalloutButton = container.querySelector(
    '[data-ui="content.interactive-frame.add-callout"]'
  );
  expect(addCalloutButton).not.toBeNull();
  expect(addCalloutButton?.getAttribute('data-sniptale-activation-bridge')).toBe('defer');

  act(() => root.unmount());
  vi.unstubAllGlobals();
});
