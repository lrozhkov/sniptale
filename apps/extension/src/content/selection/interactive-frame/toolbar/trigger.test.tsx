// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveFrameToolbarTrigger } from './trigger';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { addFrameStepBadgeChangedListener } from '../../../platform/page-context/frame-events';
import {
  createCalloutSettingsFixture,
  createStepBadgeSettingsFixture,
} from '../../frame-runtime/test-support';

vi.mock('../../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../highlighter')>()),
  isHighlighterEnabled: () => true,
}));
vi.mock('../layout/portal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout/portal')>()),
  getThemedPortalStyle: (_theme: unknown, style: React.CSSProperties) => style,
  resolveContentPortalTarget: () => document.body,
  useContentPortalTheme: () => 'light',
  Z_INDEX_FLOATING_UI: 100,
}));

let host: HTMLDivElement;
let root: Root;

function createTriggerProps() {
  return {
    closePopover: vi.fn(),
    handleStartEditing: vi.fn(),
    hoverFrame: vi.fn(),
    scheduleHoverFrameHide: vi.fn(),
    selectFrame: vi.fn(),
    setIsCalloutEditing: vi.fn(),
    setState: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('InteractiveFrameToolbarTrigger', () => {
  it('renders a localized native button and keeps the hover corridor owned by its frame', () => {
    const handlers = createTriggerProps();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 160, x: 100, y: 100 }}
          isVisible
          {...handlers}
        />
      );
    });

    const bridge = document.querySelector('.sniptale-frame-toolbar-bridge');
    const button = document.querySelector('.sniptale-frame-toolbar-trigger');
    expect(bridge?.getAttribute('data-frame-id')).toBe('frame-1');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button?.getAttribute('aria-label')).toBeTruthy();

    act(() => button?.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(handlers.hoverFrame).toHaveBeenCalledWith('frame-1');

    act(() =>
      button?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 148, clientY: 100 })
      )
    );
    expect(handlers.selectFrame).toHaveBeenCalledWith('frame-1', { x: 48, y: 0 });
  });

  it('uses the measured trigger center for keyboard-origin activation', () => {
    const handlers = createTriggerProps();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 160, x: 100, y: 100 }}
          isVisible
          {...handlers}
        />
      );
    });
    const button = document.querySelector('.sniptale-frame-toolbar-trigger') as HTMLButtonElement;
    button.getBoundingClientRect = vi.fn(() => new DOMRect(135, 87, 26, 26));

    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

    expect(handlers.selectFrame).toHaveBeenCalledWith('frame-1', { x: 48, y: 0 });
  });

  it('shows add-comment, numbering, and edit actions beside the trigger when they fit', () => {
    const handlers = createTriggerProps();
    const beginTransaction = vi
      .spyOn(pagePreparationHistory, 'beginTransaction')
      .mockImplementation(() => true);
    const stepBadgeListener = vi.fn();
    const cleanupStepBadgeListener = addFrameStepBadgeChangedListener(stepBadgeListener);
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 180, x: 100, y: 100 }}
          isVisible
          {...handlers}
        />
      );
    });

    const quickActions = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.sniptale-frame-quick-action')
    );
    expect(quickActions).toHaveLength(3);

    act(() => document.querySelector<HTMLButtonElement>('[data-quick-action="callout"]')?.click());
    act(() =>
      document.querySelector<HTMLButtonElement>('[data-quick-action="step-badge"]')?.click()
    );
    act(() => document.querySelector<HTMLButtonElement>('[data-quick-action="edit"]')?.click());

    expect(handlers.setIsCalloutEditing).toHaveBeenCalledWith(true);
    expect(handlers.setState).toHaveBeenCalledWith('idle');
    expect(handlers.handleStartEditing).toHaveBeenCalledOnce();
    expect(beginTransaction).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(stepBadgeListener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: { enabled: true },
    });
    cleanupStepBadgeListener();
  });

  it('renders only the ellipsis when the frame cannot contain the quick actions', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 36, id: 'frame-1', width: 48, x: 100, y: 100 }}
          isVisible
          {...createTriggerProps()}
        />
      );
    });

    expect(document.querySelector('.sniptale-frame-toolbar-trigger')).toBeInstanceOf(
      HTMLButtonElement
    );
    expect(document.querySelectorAll('.sniptale-frame-quick-action')).toHaveLength(0);
  });

  it('does not duplicate add actions for annotations that already exist', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{
            callout: createCalloutSettingsFixture(),
            effectMode: 'border',
            height: 80,
            id: 'frame-1',
            stepBadge: createStepBadgeSettingsFixture({ value: '1' }),
            width: 180,
            x: 100,
            y: 100,
          }}
          isVisible
          {...createTriggerProps()}
        />
      );
    });

    expect(document.querySelectorAll('.sniptale-frame-quick-action')).toHaveLength(1);
    expect(document.querySelector('[data-quick-action="edit"]')).toBeInstanceOf(HTMLButtonElement);
  });
});
