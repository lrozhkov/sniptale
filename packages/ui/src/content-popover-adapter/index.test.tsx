// @vitest-environment jsdom

import { act } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentPopoverAdapter, ContentPopoverSection } from './index';

let container: HTMLDivElement | null = null;
let portalTarget: HTMLDivElement | null = null;
let anchorEl: HTMLButtonElement | null = null;
let root: Root | null = null;

function renderPopover(isOpen: boolean, popoverRef?: { current: HTMLDivElement | null }) {
  if (!container || !portalTarget || !anchorEl) {
    throw new Error('Popover test scope is not initialized');
  }

  act(() => {
    root?.render(
      <ContentPopoverAdapter
        isOpen={isOpen}
        anchorEl={anchorEl}
        portalTarget={portalTarget}
        className="custom-popover"
        {...(popoverRef === undefined ? {} : { popoverRef })}
      >
        <div data-testid="popover-content">Popover content</div>
      </ContentPopoverAdapter>
    );
  });
}

function verifyPortalTargetRender() {
  const popoverRef = { current: null as HTMLDivElement | null };

  renderPopover(true, popoverRef);

  const popover = portalTarget?.querySelector<HTMLElement>('[data-ui="shared.ui.content-popover"]');

  expect(popover).not.toBeNull();
  expect(popover?.dataset['theme']).toBe('dark');
  expect(popover?.className).toContain('custom-popover');
  expect(popover?.className).toContain('sniptale-content-popover');
  expect(popover?.textContent).toContain('Popover content');
  expect(popoverRef.current).toBe(popover);
}

function verifyFallbackPortalRender() {
  if (!container || !anchorEl) {
    throw new Error('Popover test scope is not initialized');
  }

  act(() => {
    root?.render(
      <ContentPopoverAdapter
        isOpen
        anchorEl={anchorEl}
        className="fallback-popover"
        style={{ top: 24, left: 16, position: 'fixed' }}
        dataUi="custom.content-popover"
      >
        <div>Fallback content</div>
      </ContentPopoverAdapter>
    );
  });

  const popover = document.body.querySelector<HTMLElement>('[data-ui="custom.content-popover"]');

  expect(popover).not.toBeNull();
  expect(popover?.className).toContain('fallback-popover');
  expect(popover?.style.top).toBe('24px');
  expect(popover?.style.left).toBe('16px');
  expect(popover?.style.colorScheme).toBe('dark');
}

function renderSectionMarkup(section: ReactElement) {
  return renderToStaticMarkup(section);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  portalTarget = document.createElement('div');
  anchorEl = document.createElement('button');
  const themeOwner = document.createElement('div');
  themeOwner.setAttribute('data-theme', 'dark');
  themeOwner.appendChild(anchorEl);
  container.appendChild(themeOwner);
  container.appendChild(portalTarget);
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  portalTarget = null;
  anchorEl = null;
  vi.unstubAllGlobals();
});

describe('ContentPopoverAdapter', () => {
  it('renders into the provided portal target and inherits the resolved theme', () => {
    verifyPortalTargetRender();
  });

  it('falls back to the resolved portal target and merges explicit style with the theme', () => {
    verifyFallbackPortalRender();
  });

  it('returns null when the popover is closed', () => {
    renderPopover(false);

    expect(portalTarget?.innerHTML).toBe('');
  });

  it('renders the dedicated content popover section contract', () => {
    const markup = renderSectionMarkup(
      <ContentPopoverSection title="Settings">
        <span>Body</span>
      </ContentPopoverSection>
    );

    expect(markup).toContain('shared.ui.content-popover-section');
    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('Settings');
    expect(markup).toContain('Body');
  });

  it('supports section overrides without a title label', () => {
    const markup = renderSectionMarkup(
      <ContentPopoverSection className="custom-section" dataUi="custom.section">
        <span>Body</span>
      </ContentPopoverSection>
    );

    expect(markup).toContain('custom-section');
    expect(markup).toContain('data-ui="custom.section"');
    expect(markup).not.toContain('sniptale-content-popover-section-label');
  });
});
