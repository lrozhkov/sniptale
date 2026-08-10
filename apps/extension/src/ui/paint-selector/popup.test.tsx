// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '.';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
