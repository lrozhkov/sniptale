// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageBootstrapErrorBoundary } from './page-bootstrap-error-boundary';

function ThrowingComponent(): never {
  throw new Error('boom');
}

describe('PageBootstrapErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the fallback shell and reports the error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();

    act(() => {
      root.render(
        <PageBootstrapErrorBoundary onError={onError}>
          <ThrowingComponent />
        </PageBootstrapErrorBoundary>
      );
    });

    expect(container.textContent).toContain('Не удалось загрузить страницу');
    expect(container.textContent).toContain('Страница Sniptale столкнулась с неожиданной ошибкой');
    expect(onError).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });
});
