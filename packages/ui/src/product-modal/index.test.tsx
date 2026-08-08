// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductModal } from '@sniptale/ui/product-modal';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderModal() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProductModal onClose={() => undefined}>
        <div>Modal body</div>
      </ProductModal>
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

describe('ProductModal', () => {
  it('keeps the backdrop and dialog pointer-interactive inside content-script hosts', () => {
    renderModal();

    const backdrop = container?.querySelector<HTMLDivElement>('.sniptale-modal-backdrop');
    const dialog = container?.querySelector<HTMLDivElement>('.sniptale-modal');

    expect(backdrop?.style.pointerEvents).toBe('auto');
    expect(dialog?.style.pointerEvents).toBe('auto');
  });

  it('keeps the modal header free of decorative accent strips', () => {
    renderModal();

    expect(container?.querySelector('.sniptale-modal-accent')).toBeNull();
    expect(container?.querySelector('.sniptale-modal-accent-sm')).toBeNull();
  });

  it('locks background document scrolling for the modal lifetime and restores host styles', () => {
    document.documentElement.style.overflow = 'clip';
    document.body.style.overflow = 'scroll';
    renderModal();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    act(() => root?.unmount());
    root = null;
    expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.body.style.overflow).toBe('scroll');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
});
