// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CSSProperties } from 'react';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderSurface(style?: CSSProperties) {
  const { AnnotatableImageSurface, AnnotatableImageToolbar } = await import('./');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div>
        <AnnotatableImageToolbar>
          <button type="button">Action</button>
        </AnnotatableImageToolbar>
        <AnnotatableImageSurface checkerboard {...(style === undefined ? {} : { style })}>
          <span>Stage</span>
        </AnnotatableImageSurface>
      </div>
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
  vi.unstubAllGlobals();
});

describe('AnnotatableImageSurface', () => {
  it('renders shared stage and toolbar shells for image editing surfaces', async () => {
    await renderSurface();
    const toolbar = container?.firstElementChild?.firstElementChild as HTMLElement | null;
    const surface = container?.querySelector('span')?.parentElement as HTMLElement | null;
    const style = surface?.getAttribute('style') ?? '';

    expect(container?.textContent).toContain('Action');
    expect(container?.textContent).toContain('Stage');
    expect(container?.innerHTML).toContain('rounded-[18px]');
    expect(container?.innerHTML).toContain('surface-panel');
    expect(container?.innerHTML).toContain('items-start');
    expect(toolbar?.className).not.toContain('overflow-hidden');
    expect(style).toContain('background-image');
    expect(style).toContain('linear-gradient(45deg');
    expect(style).toContain('var(--sniptale-color-text-muted)');
    expect(style).toContain('var(--sniptale-color-surface-canvas)');
    expect(style).not.toContain('rgba(255, 255, 255, 0.12)');
    expect(style).toContain('background-position-x: 0px, 10px;');
    expect(style).toContain('background-position-y: 0px, 10px;');
    expect(style).toContain('background-size: 20px 20px;');
    expect(container?.innerHTML).not.toContain('overflow-x-auto');
  });

  it('keeps caller styles authoritative over the default checkerboard backing', async () => {
    await renderSurface({
      backgroundColor: 'rgb(1, 2, 3)',
      backgroundImage: 'none',
      backgroundPositionX: 'center',
      backgroundPositionY: 'center',
      backgroundSize: '8px 8px',
    });

    const surface = container?.querySelector('span')?.parentElement as HTMLElement | null;
    const style = surface?.getAttribute('style') ?? '';

    expect(style).toContain('background-color: rgb(1, 2, 3);');
    expect(style).toContain('background-image: none;');
    expect(style).toContain('background-position-x: center;');
    expect(style).toContain('background-position-y: center;');
    expect(style).toContain('background-size: 8px 8px;');
  });
});
