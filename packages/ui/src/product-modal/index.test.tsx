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
});
