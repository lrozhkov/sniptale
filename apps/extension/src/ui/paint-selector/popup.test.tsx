// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '.';
import { resolvePaintSelectorLayerStyle } from './lifecycle';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('bounds the single-column layer by the space on its chosen side of the anchor', () => {
  vi.stubGlobal('innerHeight', 640);
  expect(resolvePaintSelectorLayerStyle({ top: 66 }, null).maxHeight).toBe(566);
  expect(
    resolvePaintSelectorLayerStyle({ top: 500, transform: 'translateY(-100%)' }, null).maxHeight
  ).toBe(492);
});

it('keeps one native eyedropper session active until a click selects the color', async () => {
  let resolvePick: ((result: { sRGBHex: string }) => void) | null = null;
  let receivedSignal: AbortSignal | undefined;
  const open = vi.fn(
    (options?: { signal?: AbortSignal }) =>
      new Promise<{ sRGBHex: string }>((resolve) => {
        receivedSignal = options?.signal;
        resolvePick = resolve;
      })
  );
  vi.stubGlobal(
    'EyeDropper',
    class {
      open(options?: { signal?: AbortSignal }) {
        return open(options);
      }
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onPreviewChange = vi.fn();

  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#ff0000')}
        onChange={vi.fn()}
        onPreviewChange={onPreviewChange}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const eyedropperButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.color-selector.eyedropper"]'
  )!;

  await act(async () => eyedropperButton.click());

  expect(open).toHaveBeenCalledOnce();
  expect(eyedropperButton.disabled).toBe(true);
  expect(receivedSignal?.aborted).toBe(false);
  act(() => eyedropperButton.click());
  expect(open).toHaveBeenCalledOnce();

  await act(async () => resolvePick?.({ sRGBHex: '#123456' }));

  expect(onPreviewChange).toHaveBeenLastCalledWith(createSolidPaint('#123456'));
  expect(receivedSignal?.aborted).toBe(false);
  act(() => root.unmount());
  host.remove();
});

it('edits the selected stop below the rail, adds a selected stop and cancels the whole draft', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const onPreviewChange = vi.fn();
  const onPreviewReset = vi.fn();
  const value = {
    kind: 'gradient' as const,
    gradient: {
      type: 'linear' as const,
      angle: 90,
      interpolation: 'srgb' as const,
      repeat: { enabled: false, span: 1 },
      stops: [
        { id: 'first', position: 0, color: '#ff0000ff', midpoint: 0.5 },
        { id: 'last', position: 1, color: '#0000ffff', midpoint: 0.5 },
      ],
    },
  };
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={value}
        onChange={onChange}
        onPreviewChange={onPreviewChange}
        onPreviewReset={onPreviewReset}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  const button = (label: string) =>
    popup.querySelector<HTMLButtonElement>(`[aria-label="highlighter.paintPicker.${label}"]`)!;
  const rail = popup.querySelector('[data-ui="shared.ui.paint-selector.rail"]')!;
  const color = popup.querySelector('[data-ui="shared.ui.color-selector.editor-panel"]')!;
  expect(rail.compareDocumentPosition(color)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(
    document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.layer"]')?.style.width
  ).toBe('328px');
  expect(button('removeStop').disabled).toBe(true);
  act(() => button('gradientStop 100%').click());
  expect(onPreviewChange).not.toHaveBeenCalled();
  const hex = popup.querySelector<HTMLInputElement>(
    'input[aria-label="shared.ui.colorSelectorHex"]'
  )!;
  expect(hex.value.toLowerCase()).toContain('0000ff');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex, '#00ff00');
    hex.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onPreviewChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      gradient: expect.objectContaining({
        stops: [
          value.gradient.stops[0],
          expect.objectContaining({ id: 'last', color: '#00ff00ff' }),
        ],
      }),
    })
  );
  act(() => button('addStop').click());
  expect(
    popup.querySelectorAll('button[aria-label^="highlighter.paintPicker.gradientStop"]')
  ).toHaveLength(3);
  expect(button('gradientStop 50%').getAttribute('aria-pressed')).toBe('true');
  expect(button('removeStop').disabled).toBe(false);
  act(() => button('removeStop').click());
  expect(button('removeStop').disabled).toBe(true);
  act(() =>
    Array.from(popup.querySelectorAll('button'))
      .find((b) => b.textContent === 'shared.ui.colorSelectorCancel')!
      .click()
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreviewReset).toHaveBeenCalledWith(value);
  expect(document.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).toBeNull();
  act(() => root.unmount());
});
