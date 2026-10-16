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
      onClick={() => props.onChange({ kind: 'solid', color: '#123456ff' })}
    />
  ),
}));

import { SurfaceStylePresetEditor } from './editor';

it('submits an edited system style atomically with its name and canonical CSS', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const onSave = vi.fn().mockResolvedValue(true);
  await act(async () =>
    root.render(
      <SurfaceStylePresetEditor
        onClose={vi.fn()}
        onSave={onSave}
        open
        preset={{
          customized: false,
          enabled: true,
          id: 'system-surface-plain',
          name: 'Обычный',
          order: 0,
          origin: 'system',
          style: { fillPaint: { kind: 'solid', color: '#ffffffff' }, surfaceCss: '' },
        }}
      />
    )
  );
  const input = node.querySelector<HTMLInputElement>('input')!;
  const textarea = node.querySelector<HTMLTextAreaElement>('textarea')!;
  const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const setTextarea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setInput.call(input, 'Мой стиль');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTextarea.call(textarea, ' color: red; ');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    node.querySelector<HTMLButtonElement>('[data-paint]')!.click();
  });
  await act(async () =>
    [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Сохранить')!
      .click()
  );
  expect(onSave).toHaveBeenCalledWith('Мой стиль', {
    fillPaint: { kind: 'solid', color: '#123456ff' },
    surfaceCss: 'color: red;',
  });
  act(() => root.unmount());
});

it('clears the ordinary preset name without saving and returns focus to the field', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const onSave = vi.fn();
  try {
    await act(async () =>
      root.render(<SurfaceStylePresetEditor onClose={vi.fn()} onSave={onSave} open preset={null} />)
    );
    const input = node.querySelector<HTMLInputElement>('input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'Draft name');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const clear = node.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
    expect(clear).not.toBeNull();
    await act(async () => clear.click());
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(80);
    expect(node.querySelector('.sniptale-field-clear')).toBeNull();
    const save = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Сохранить'
    )!;
    expect(save.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});
