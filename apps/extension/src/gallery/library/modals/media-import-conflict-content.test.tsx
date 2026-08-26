// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { productSelectPropsMock } = vi.hoisted(() => ({ productSelectPropsMock: vi.fn() }));

vi.mock('@sniptale/ui/product-form-controls', () => ({
  ProductSelect: (props: {
    onChange: (value: 'duplicate') => void;
    options: Array<{ value: string }>;
    value: string;
  }) => {
    productSelectPropsMock(props);
    return (
      <button
        type="button"
        data-ui="test.media-conflict-select"
        onClick={() => props.onChange('duplicate')}
      >
        {props.value}
      </button>
    );
  },
}));

vi.mock('./frame', () => ({
  GalleryModalFrame: (props: { children: React.ReactNode; title: string }) => (
    <div data-ui="test.modal-frame">
      <div>{props.title}</div>
      {props.children}
    </div>
  ),
}));

import { MediaImportConflictModalContent } from './media-import-conflict-content';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows exact matches and confirms the selected local-file conflict strategy', () => {
  const onImport = vi.fn();
  act(() => {
    root.render(
      <MediaImportConflictModalContent
        conflicts={[{ filename: 'capture.png', size: 1024 }]}
        fileCount={3}
        onClose={vi.fn()}
        onImport={onImport}
      />
    );
  });

  expect(container.textContent).toContain('capture.png');
  expect(container.textContent).toContain('3');
  expect(productSelectPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'skip' }),
        expect.objectContaining({ value: 'duplicate' }),
      ]),
      value: 'skip',
    })
  );

  act(() => {
    container
      .querySelector('[data-ui="test.media-conflict-select"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const continueButton = Array.from(container.querySelectorAll('button')).at(-1);
  act(() => continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(onImport).toHaveBeenCalledWith('duplicate');
});
