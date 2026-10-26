// @vitest-environment jsdom

import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import { act } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '.';
import { resolvePaintSelectorLayerStyle } from './lifecycle';

const mountedRoots = new Set<ReturnType<typeof createReactRoot>>();
function createRoot(container: Element) {
  const root = createReactRoot(container);
  mountedRoots.add(root);
  const unmount = root.unmount.bind(root);
  root.unmount = () => {
    mountedRoots.delete(root);
    unmount();
  };
  return root;
}
afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots) root.unmount();
    hideAllToasts();
  });
  expect(document.querySelectorAll('[data-ui="shared.toast.host"]')).toHaveLength(0);
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

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
  expect(eyedropperButton.disabled).toBe(false);
  expect(eyedropperButton.getAttribute('aria-busy')).toBe('true');
  expect(receivedSignal?.aborted).toBe(false);
  act(() => eyedropperButton.click());
  expect(open).toHaveBeenCalledOnce();

  await act(async () => resolvePick?.({ sRGBHex: '#123456' }));

  expect(onPreviewChange).toHaveBeenLastCalledWith(createSolidPaint('#123456'));
  expect(receivedSignal?.aborted).toBe(false);
  act(() => root.unmount());
  host.remove();
});

it('shows full opacity in the color editor when starting a gradient from transparent fill', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onPreviewChange = vi.fn();
  act(() =>
    root.render(
      <CompactPaintSelector
        label="Fill"
        title="Fill"
        value={createSolidPaint('#12345600')}
        onChange={vi.fn()}
        onPreviewChange={onPreviewChange}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  act(() =>
    popup
      .querySelector<HTMLButtonElement>('button[aria-label="highlighter.paintPicker.gradient"]')!
      .click()
  );
  expect(onPreviewChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      gradient: expect.objectContaining({
        stops: expect.arrayContaining([expect.objectContaining({ color: '#123456ff' })]),
      }),
    })
  );
  const opacity = popup.querySelector<HTMLElement>('[data-ui="shared.ui.color-selector.opacity"]')!;
  expect(opacity.querySelector('input')?.value).toBe('100');
  act(() => root.unmount());
  host.remove();
});

it('shows the rail before selected-stop controls, then edits and cancels the draft', () => {
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
  const selectedStop = popup.querySelector('[data-ui="shared.ui.paint-selector.selected-stop"]')!;
  const color = popup.querySelector('[data-ui="shared.ui.color-selector.editor-panel"]')!;
  expect(rail.compareDocumentPosition(selectedStop)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(rail.compareDocumentPosition(color)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(selectedStop.querySelector('button')?.getAttribute('aria-label')).toBe(
    'highlighter.paintPicker.gradientStop 1/2'
  );
  expect(
    document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.layer"]')?.style.width
  ).toBe('620px');
  expect(button('removeStop').disabled).toBe(true);
  act(() => button('gradientStop 100%').click());
  expect(selectedStop.querySelector('button')?.getAttribute('aria-label')).toBe(
    'highlighter.paintPicker.gradientStop 2/2'
  );
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
    rail.querySelectorAll('button[aria-label^="highlighter.paintPicker.gradientStop"]')
  ).toHaveLength(3);
  expect(button('gradientStop 50%').getAttribute('aria-pressed')).toBe('true');
  expect(selectedStop.querySelector('button')?.getAttribute('aria-label')).toBe(
    'highlighter.paintPicker.gradientStop 2/3'
  );
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

it('restores new and accepted stop colors across selection changes and resets the baseline on reopen', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onPreviewChange = vi.fn();
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
  await act(async () =>
    root.render(
      <CompactPaintSelector
        density="full"
        label="Fill"
        title="Fill"
        value={value}
        onChange={vi.fn()}
        onPreviewChange={onPreviewChange}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  const button = (label: string) =>
    popup.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  act(() => button('highlighter.paintPicker.addStop').click());
  const added = onPreviewChange.mock.lastCall?.[0].gradient.stops[1];
  expect(added.position).toBe(0.5);
  const edit = (hexValue: string) => {
    const hex = popup.querySelector<HTMLInputElement>(
      'input[aria-label="shared.ui.colorSelectorHex"]'
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        hex,
        hexValue
      );
      hex.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  edit('#00ff00');
  act(() => button('highlighter.paintPicker.gradientStop 0%').click());
  act(() => button('highlighter.paintPicker.gradientStop 50%').click());
  act(() => button('shared.ui.colorSelectorOriginal').click());
  expect(
    onPreviewChange.mock.lastCall?.[0].gradient.stops.find(
      (stop: { id: string }) => stop.id === added.id
    ).color
  ).toBe(added.color);
  expect(document.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).not.toBeNull();
  act(() => button('highlighter.paintPicker.gradientStop 0%').click());
  edit('#00ff00');
  act(() => button('shared.ui.colorSelectorOriginal').click());
  expect(onPreviewChange.mock.lastCall?.[0].gradient.stops[0].color).toBe('#ff0000ff');
  act(() =>
    Array.from(popup.querySelectorAll('button'))
      .find((item) => item.textContent === 'shared.ui.colorSelectorCancel')!
      .click()
  );
  const accepted = {
    ...value,
    gradient: {
      ...value.gradient,
      stops: [value.gradient.stops[0]!, { ...added, color: '#ffff00ff' }, value.gradient.stops[1]!],
    },
  };
  await act(async () =>
    root.render(
      <CompactPaintSelector
        density="full"
        label="Fill"
        title="Fill"
        value={accepted}
        onChange={vi.fn()}
        onPreviewChange={onPreviewChange}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const reopened = document.querySelector<HTMLElement>(
    '[data-ui="shared.ui.paint-selector.popup"]'
  )!;
  act(() =>
    reopened
      .querySelector<HTMLButtonElement>('[aria-label="highlighter.paintPicker.gradientStop 50%"]')!
      .click()
  );
  const hex = reopened.querySelector<HTMLInputElement>(
    'input[aria-label="shared.ui.colorSelectorHex"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex, '#00ff00');
    hex.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() =>
    reopened
      .querySelector<HTMLButtonElement>('[aria-label="shared.ui.colorSelectorOriginal"]')!
      .click()
  );
  expect(onPreviewChange.mock.lastCall?.[0].gradient.stops[1].color).toBe('#ffff00ff');
});
