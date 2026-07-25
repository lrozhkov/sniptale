// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveFrameToolbarTrigger } from './trigger';

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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

describe('InteractiveFrameToolbarTrigger', () => {
  it('renders a localized native button and keeps the hover corridor owned by its frame', () => {
    const hoverFrame = vi.fn();
    const scheduleHoverFrameHide = vi.fn();
    const selectFrame = vi.fn();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 160, x: 100, y: 100 }}
          isVisible
          hoverFrame={hoverFrame}
          scheduleHoverFrameHide={scheduleHoverFrameHide}
          selectFrame={selectFrame}
        />
      );
    });

    const bridge = document.querySelector('.sniptale-frame-toolbar-bridge');
    const button = document.querySelector('.sniptale-frame-toolbar-trigger');
    expect(bridge?.getAttribute('data-frame-id')).toBe('frame-1');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button?.getAttribute('aria-label')).toBeTruthy();

    act(() => button?.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(hoverFrame).toHaveBeenCalledWith('frame-1');

    act(() =>
      button?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 148, clientY: 100 })
      )
    );
    expect(selectFrame).toHaveBeenCalledWith('frame-1', { x: 48, y: 0 });
  });

  it('uses the measured trigger center for keyboard-origin activation', () => {
    const selectFrame = vi.fn();
    act(() => {
      root.render(
        <InteractiveFrameToolbarTrigger
          frame={{ effectMode: 'border', height: 80, id: 'frame-1', width: 160, x: 100, y: 100 }}
          isVisible
          hoverFrame={vi.fn()}
          scheduleHoverFrameHide={vi.fn()}
          selectFrame={selectFrame}
        />
      );
    });
    const button = document.querySelector('.sniptale-frame-toolbar-trigger') as HTMLButtonElement;
    button.getBoundingClientRect = vi.fn(() => new DOMRect(135, 87, 26, 26));

    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

    expect(selectFrame).toHaveBeenCalledWith('frame-1', { x: 48, y: 0 });
  });
});
