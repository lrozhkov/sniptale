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
import { translate } from '../../../../platform/i18n';
import * as frameEvents from '../../../platform/page-context/frame-events';

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
  const stepChange = vi
    .spyOn(frameEvents, 'dispatchFrameStepBadgeChanged')
    .mockImplementation(() => undefined);
  const calloutChange = vi
    .spyOn(frameEvents, 'dispatchFrameCalloutChanged')
    .mockImplementation(() => undefined);
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
  const deleteButton = container.querySelector<SVGElement>('.lucide-trash-2')?.closest('button');
  const closeButton = container.querySelector<SVGElement>('.lucide-x')?.closest('button');

  expect(button?.getAttribute('aria-pressed')).toBe('false');
  expect(button?.querySelector('.lucide-eye')).not.toBeNull();
  expect(button?.previousElementSibling).toHaveProperty(
    'className',
    'sniptale-glass-toolbar-divider'
  );
  expect(button?.nextElementSibling).toHaveProperty('className', 'sniptale-glass-toolbar-divider');
  expect(button?.nextElementSibling?.nextElementSibling).toBe(deleteButton);
  expect(deleteButton?.nextElementSibling).toBe(closeButton);
  expect(closeButton?.title).toBe(translate('content.interactiveFrame.closeToolbar'));
  act(() => button?.click());
  expect(props.captureVisibility.toggle).toHaveBeenCalledOnce();
  expect(onUpdate).not.toHaveBeenCalled();
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.stepBadge.settingsTitle')}"]`
      )
      ?.click()
  );
  expect(stepChange).toHaveBeenCalledWith({ frameId: 'frame-1', settings: { enabled: true } });
  expect(onUpdate).not.toHaveBeenCalled();
  expect(props.togglePopover).not.toHaveBeenCalled();
  onUpdate.mockClear();
  expect(
    container.querySelectorAll('[data-ui="content.interactive-frame.add-callout"]')
  ).toHaveLength(0);

  const calloutSettings = createCalloutSettingsFixture();
  act(() =>
    root.render(
      <InteractiveFrameToolbarContent
        toolbarProps={{
          ...props,
          frame: createFrameDataFixture('frame-1', {
            callout: calloutSettings,
          }),
        }}
      />
    )
  );
  const addCalloutButton = container.querySelector(
    '[data-ui="content.interactive-frame.add-callout"]'
  );
  expect(addCalloutButton).not.toBeNull();
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.callout.settingsTitle')}"]`
      )
      ?.click()
  );
  expect(calloutChange).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { enabled: !calloutSettings.enabled },
  });
  expect(onUpdate).not.toHaveBeenCalled();
  expect(props.togglePopover).not.toHaveBeenCalled();
  expect(addCalloutButton?.getAttribute('data-sniptale-activation-bridge')).toBe('defer');
  expect(
    addCalloutButton?.previousElementSibling?.querySelector('button')?.getAttribute('title')
  ).toBe(translate('content.callout.settingsTitle'));
  expect(
    container.querySelector<HTMLButtonElement>(
      `button[title="${translate('content.interactiveFrame.editButton')}"]`
    )
  ).not.toBeNull();

  act(() => root.unmount());
  vi.unstubAllGlobals();
});
