// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { FrameEditingOverlay } from './layers';
import { FRAME_ANNOTATION_Z_INDEX } from '../../../../features/highlighter/frame-annotation/interaction/z-index';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let contentHost: HTMLDivElement | null = null;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  contentHost?.remove();
  contentHost = null;
  document.body.replaceChildren();
  document.body.removeAttribute('data-theme');
});

function mountContentRoot(theme: 'light' | 'dark' = 'light') {
  contentHost = document.createElement('div');
  contentHost.id = CONTENT_ROOT_ID;
  contentHost.setAttribute('data-theme', theme);
  document.body.append(contentHost);
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  const roots = initializeContentUiRoots(shadowRoot);
  return { host: contentHost, shadowRoot, ...roots };
}

function renderNode(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

it.each(['light', null] as const)(
  'blocks page clicks below resize controls for theme %s',
  (theme) => {
    const { shadowRoot } = mountContentRoot();
    renderNode(<FrameEditingOverlay portalTheme={theme} clipPath="inset(0)" />);
    const overlay = shadowRoot.querySelector<HTMLElement>('.sniptale-editing-blocking-overlay')!;
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(FRAME_ANNOTATION_Z_INDEX.frameActive);
    expect(Number(overlay.style.zIndex)).toBeLessThan(FRAME_ANNOTATION_Z_INDEX.resizeHandles);
    for (const type of ['mousedown', 'click']) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true });
      act(() => overlay.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
  }
);
