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
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';

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
    captureVisibility: { hiddenDuringCapture: false, toggle: vi.fn() },
    clearSelection: vi.fn(),
    closePopover: vi.fn(),
    handleStartEditing: vi.fn(),
    hoverFrame: vi.fn(),
    popoverAnchorRef: React.createRef<HTMLButtonElement>(),
    onUpdate: vi.fn(),
    scheduleHoverFrameHide: vi.fn(),
    selectFrame: vi.fn(),
    setIsCalloutEditing: vi.fn(),
    setActiveCalloutIndex: vi.fn(),
    setTempFrame: vi.fn(),
    setState: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useFrameUIStore.getState().reset();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('InteractiveFrameToolbarTrigger', () => {
  it('separates viewport placement from layout zoom', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 240, x: 100, y: 100 }}
          isVisible
          {...createTriggerProps()}
        />
      );
    });

    const positioner = document.querySelector('.sniptale-frame-toolbar-bridge-positioner');
    const surface = positioner?.querySelector('.sniptale-frame-toolbar-bridge');
    expect(positioner?.classList).toContain('sniptale-content-ui-positioner');
    expect(surface?.classList).toContain('sniptale-content-ui-zoom-surface');
    expect((positioner as HTMLElement | null)?.style.pointerEvents).toBe('none');
    expect(
      Array.from(positioner?.querySelectorAll<HTMLButtonElement>('button') ?? []).every(
        (button) => button.style.pointerEvents === 'auto'
      )
    ).toBe(true);
  });

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

  it('shows frame settings first, followed by add-comment, numbering, and edit when they fit', () => {
    const handlers = createTriggerProps();
    const beginTransaction = vi
      .spyOn(pagePreparationHistory, 'beginTransaction')
      .mockImplementation(() => true);
    const stepBadgeListener = vi.fn();
    const cleanupStepBadgeListener = addFrameStepBadgeChangedListener(stepBadgeListener);
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 240, x: 100, y: 100 }}
          isVisible
          {...handlers}
        />
      );
    });

    const quickActions = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.sniptale-frame-quick-action')
    );
    expect(quickActions).toHaveLength(5);
    expect(quickActions[0]?.dataset['quickAction']).toBe('settings');

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

  it('centers every mini icon as a block inside its circular frame control', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 240, x: 100, y: 100 }}
          isVisible
          {...createTriggerProps()}
        />
      );
    });

    const icons = Array.from(
      document.querySelectorAll<SVGElement>(
        '.sniptale-frame-quick-action > svg, .sniptale-frame-toolbar-trigger > svg'
      )
    );
    expect(icons).toHaveLength(6);
    expect(icons.every((icon) => icon.style.display === 'block')).toBe(true);
  });

  it('uses the system arrow in the gaps between mini controls', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 240, x: 100, y: 100 }}
          isVisible
          {...createTriggerProps()}
        />
      );
    });

    const bridge = document.querySelector<HTMLElement>('.sniptale-frame-toolbar-bridge');
    expect(bridge?.style.cursor).toBe('default');
    expect(bridge?.style.pointerEvents).toBe('auto');
    expect(
      document.querySelector<HTMLButtonElement>('.sniptale-frame-quick-action')?.style.cursor
    ).toBe('pointer');
  });

  it.each([
    ['border', 'lucide-square'],
    ['blur', 'lucide-droplet'],
    ['focus', 'lucide-focus'],
  ] as const)('opens quick frame settings with the dynamic %s icon', (effectMode, iconClass) => {
    const handlers = createTriggerProps();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode, height: 80, id: 'frame-1', width: 240, x: 100, y: 100 }}
          isVisible
          {...handlers}
        />
      );
    });

    const settingsButton = document.querySelector<HTMLButtonElement>(
      '[data-quick-action="settings"]'
    );
    expect(settingsButton?.querySelector(`.${iconClass}`)).not.toBeNull();
    act(() => settingsButton?.click());

    expect(handlers.popoverAnchorRef.current).toBe(settingsButton);
    expect(useFrameUIStore.getState()).toMatchObject({
      activePopover: { frameId: 'frame-1', kind: 'frame-settings' },
      selectedFrameId: null,
    });
  });

  it('keeps capture visibility beside the ellipsis when the frame cannot contain optional actions', () => {
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
    expect(document.querySelectorAll('.sniptale-frame-quick-action')).toHaveLength(1);
    expect(document.querySelector('[data-quick-action="capture-visibility"]')).toBeInstanceOf(
      HTMLButtonElement
    );
  });
});

describe('InteractiveFrameToolbarTrigger additional comments', () => {
  it('replaces the primary add action with an additional-comment action', () => {
    const handlers = createTriggerProps();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{
            callout: createCalloutSettingsFixture(),
            effectMode: 'border',
            height: 80,
            id: 'frame-1',
            stepBadge: createStepBadgeSettingsFixture({ value: '1' }),
            width: 240,
            x: 100,
            y: 100,
          }}
          isVisible
          {...handlers}
        />
      );
    });

    expect(document.querySelectorAll('.sniptale-frame-quick-action')).toHaveLength(4);
    expect(document.querySelector('[data-quick-action="settings"]')).toBeInstanceOf(
      HTMLButtonElement
    );
    expect(document.querySelector('[data-quick-action="callout"]')).toBeNull();
    const addButton = document.querySelector<HTMLButtonElement>(
      '[data-quick-action="add-callout"]'
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);
    expect(addButton?.disabled).toBe(false);
    expect(document.querySelector('[data-quick-action="edit"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[data-quick-action="capture-visibility"]')).toBeInstanceOf(
      HTMLButtonElement
    );

    act(() =>
      addButton?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })
      )
    );
    expect(handlers.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalCallouts: [expect.objectContaining({ enabled: true })],
      })
    );
    expect(handlers.setActiveCalloutIndex).toHaveBeenCalledWith(1);
    expect(handlers.setIsCalloutEditing).toHaveBeenCalledWith(true);
  });

  it('requests a fifth comment without hiding the mini action before the frame update is accepted', () => {
    const handlers = createTriggerProps();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{
            additionalCallouts: Array.from({ length: 3 }, () => createCalloutSettingsFixture()),
            callout: createCalloutSettingsFixture(),
            effectMode: 'border',
            height: 80,
            id: 'frame-1',
            width: 240,
            x: 100,
            y: 100,
          }}
          isVisible
          {...handlers}
        />
      );
    });

    const addButton = document.querySelector<HTMLButtonElement>(
      '[data-quick-action="add-callout"]'
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);
    expect(addButton?.disabled).toBe(false);
    act(() => {
      addButton?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })
      );
      addButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
      );
    });
    expect(handlers.onUpdate).toHaveBeenCalledOnce();
    expect(handlers.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ additionalCallouts: expect.arrayContaining([expect.any(Object)]) })
    );
    expect(handlers.onUpdate.mock.calls.at(-1)?.[0]?.additionalCallouts).toHaveLength(4);
    expect(document.querySelector('[data-quick-action="add-callout"]')).toBeInstanceOf(
      HTMLButtonElement
    );
  });

  it('hides the additional-comment mini action at the toolbar limit', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{
            additionalCallouts: Array.from({ length: 4 }, () => createCalloutSettingsFixture()),
            callout: createCalloutSettingsFixture(),
            effectMode: 'border',
            height: 80,
            id: 'frame-1',
            width: 240,
            x: 100,
            y: 100,
          }}
          isVisible
          {...createTriggerProps()}
        />
      );
    });

    expect(document.querySelector('[data-quick-action="add-callout"]')).toBeNull();
  });

  it('hides the mini action when either state authority reports the limit', () => {
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{
            additionalCallouts: Array.from({ length: 3 }, () => createCalloutSettingsFixture()),
            callout: createCalloutSettingsFixture(),
            effectMode: 'border',
            height: 80,
            id: 'frame-1',
            width: 240,
            x: 100,
            y: 100,
          }}
          isVisible
          canAddCallout={false}
          {...createTriggerProps()}
        />
      );
    });

    expect(document.querySelector('[data-quick-action="add-callout"]')).toBeNull();
  });
});

describe('InteractiveFrameToolbarTrigger capture visibility', () => {
  it('toggles capture-only frame visibility without changing live frame geometry', () => {
    const handlers = createTriggerProps();
    const frame = {
      effectMode: 'border' as const,
      height: 80,
      id: 'frame-1',
      width: 48,
      x: 100,
      y: 100,
    };
    act(() => {
      root.render(<InteractiveFrameToolbarTrigger frame={frame} isVisible {...handlers} />);
    });

    const button = document.querySelector<HTMLButtonElement>(
      '[data-quick-action="capture-visibility"]'
    );
    expect(button?.dataset['active']).toBeUndefined();
    expect(button?.querySelector('.lucide-eye')).not.toBeNull();
    act(() => button?.click());

    expect(handlers.captureVisibility.toggle).toHaveBeenCalledOnce();
  });
});
