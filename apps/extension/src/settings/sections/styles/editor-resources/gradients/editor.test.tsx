// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@sniptale/ui/product-modal', () => ({
  ProductModal: (props: { children: React.ReactNode; isOpen: boolean }) =>
    props.isOpen ? <div>{props.children}</div> : null,
  ProductModalBody: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { title: string }) => <h2>{props.title}</h2>,
}));
vi.mock('../../../../../ui/paint-selector', () => ({
  CompactPaintSelector: (props: { onChange(value: unknown): void }) => (
    <button
      data-paint
      type="button"
      onClick={() =>
        props.onChange({
          kind: 'gradient',
          gradient: {
            angle: 90,
            interpolation: 'oklab',
            repeat: { enabled: false, span: 1 },
            stops: [
              { color: '#ffffffff', id: 'a', midpoint: 0.5, position: 0 },
              { color: '#000000ff', id: 'b', midpoint: 0.5, position: 1 },
            ],
            type: 'linear',
          },
        })
      }
    />
  ),
}));

import { GradientPresetEditor } from './editor';

it('submits an edited system gradient atomically with its name', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const onSave = vi.fn().mockResolvedValue(true);
  await act(async () =>
    root.render(<GradientPresetEditor onClose={vi.fn()} onSave={onSave} open preset={null} />)
  );
  const input = node.querySelector<HTMLInputElement>('input')!;
  const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setInput.call(input, 'Мой градиент');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    node.querySelector<HTMLButtonElement>('[data-paint]')!.click();
  });
  await act(async () =>
    [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Сохранить')!
      .click()
  );
  expect(onSave).toHaveBeenCalledWith(
    'Мой градиент',
    expect.objectContaining({ angle: 90, type: 'linear' })
  );
  act(() => root.unmount());
});
