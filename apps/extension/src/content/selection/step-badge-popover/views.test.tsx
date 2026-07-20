// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addStepBadgeReorderListener } from '../../platform/page-context/frame-events';
import { StepBadgePopoverContent } from './body';
import { StepBadgeAutoSection, StepBadgeValueSection } from './views';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <StepBadgeValueSection frameId="frame-1" isAuto onValueChange={vi.fn()} value="A" />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function registerStepBadgeReorderTest(): void {
  it('dispatches reorder events through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addStepBadgeReorderListener(listener);

    renderHarness();

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(listener).toHaveBeenCalledWith({ direction: 'up', frameId: 'frame-1' });

    cleanup();
  });
}

function registerStepBadgeAutoSectionTest(): void {
  it('uses the shared content popover section contract for auto mode', () => {
    const markup = renderToStaticMarkup(
      <StepBadgeAutoSection
        isAuto
        settings={{ enabled: true, type: 'letter', alphabet: 'latin', value: 'A' }}
        onAlphabetChange={vi.fn()}
        onAutoModeChange={vi.fn()}
        onTypeChange={vi.fn()}
      />
    );

    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('content.step-badge.auto-section');
    expect(markup).toContain('sniptale-glass-switch');
  });
}

function registerStepBadgeDisableActionTest(): void {
  it('keeps the disable action on the shared popover danger button seam', () => {
    const markup = renderToStaticMarkup(
      <StepBadgePopoverContent
        frameId="frame-1"
        isAuto={false}
        localStepBadgeSettings={{ enabled: true, type: 'number', value: '1' }}
        onAlphabetChange={vi.fn()}
        onAnchorChange={vi.fn()}
        onAutoModeChange={vi.fn()}
        onDisable={vi.fn()}
        onOffsetToggle={vi.fn()}
        onSizeLevelChange={vi.fn()}
        onTypeChange={vi.fn()}
        onValueChange={vi.fn()}
      />
    );

    expect(markup).toContain('Выключить');
    expect(markup).toContain('sniptale-glass-destructive');
  });
}

describe('StepBadgeValueSection', () => {
  registerStepBadgeReorderTest();
  registerStepBadgeAutoSectionTest();
  registerStepBadgeDisableActionTest();
});
