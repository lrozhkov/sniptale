// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DetailEnhancementField } from './detail-enhancement-field';

const backend = vi.hoisted(() => ({ probe: vi.fn(), create: vi.fn() }));
vi.mock('../../features/video/composition/export-enhancement/enhancer', () => ({
  probeEnhancementCapabilities: backend.probe,
  createExportEnhancer: backend.create,
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  backend.probe.mockReset().mockResolvedValue({ clark: true, reason: 'supported' });
  backend.create.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
const choices = () => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];

it('keeps Off as the missing default and disables Clark until the advisory probe completes', async () => {
  let finish!: (value: { clark: true; reason: 'supported' }) => void;
  backend.probe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const change = vi.fn();
  await act(async () =>
    root.render(<DetailEnhancementField value={undefined} onChange={change} />)
  );
  await vi.waitFor(() => expect(backend.probe).toHaveBeenCalledOnce());
  expect(trigger().textContent).toContain('detailEnhancementOff');
  expect(host.textContent).toContain('detailEnhancementChecking');
  act(() => trigger().click());
  expect(choices()).toHaveLength(3);
  const clark = choices().find((choice) => choice.textContent?.includes('detailEnhancementClark'))!;
  expect(clark.disabled).toBe(true);
  act(() => clark.click());
  expect(change).not.toHaveBeenCalled();
  await act(async () => finish({ clark: true, reason: 'supported' }));
  expect(
    choices().find((choice) => choice.textContent?.includes('detailEnhancementClark'))!.disabled
  ).toBe(false);
  await act(async () =>
    choices()
      .find((choice) => choice.textContent?.includes('detailEnhancementClark'))!
      .click()
  );
  expect(change).toHaveBeenCalledExactlyOnceWith('clark-x2');
  expect(backend.create).not.toHaveBeenCalled();
});

it.each([
  ['webgpu-unavailable', 'detailEnhancementWebGpuUnavailable'],
  ['adapter-unavailable', 'detailEnhancementAdapterUnavailable'],
  ['shader-f16-unavailable', 'detailEnhancementPrecisionUnavailable'],
  ['adapter-request-failed', 'detailEnhancementProbeFailed'],
] as const)(
  'retains selected Clark and explains %s without writing another value',
  async (reason, label) => {
    backend.probe.mockResolvedValueOnce({ clark: false, reason });
    const change = vi.fn();
    await act(async () =>
      root.render(<DetailEnhancementField value="clark-x2" onChange={change} />)
    );
    await vi.waitFor(() => expect(host.textContent).toContain(label));
    expect(trigger().textContent).toContain('detailEnhancementClark');
    act(() => trigger().click());
    expect(
      choices().find((choice) => choice.textContent?.includes('detailEnhancementClark'))!.disabled
    ).toBe(true);
    await act(async () =>
      choices()
        .find((choice) => choice.textContent?.includes('detailEnhancementOff'))!
        .click()
    );
    expect(change).toHaveBeenCalledExactlyOnceWith('off');
    expect(backend.create).not.toHaveBeenCalled();
  }
);

it('ignores an advisory response from an unmounted export field', async () => {
  let finish!: (value: { clark: true; reason: 'supported' }) => void;
  backend.probe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const change = vi.fn();
  await act(async () =>
    root.render(<DetailEnhancementField value="bicubic-sharpen" onChange={change} />)
  );
  await vi.waitFor(() => expect(backend.probe).toHaveBeenCalledOnce());
  act(() => root.render(null));
  await act(async () => finish({ clark: true, reason: 'supported' }));
  expect(host.childElementCount).toBe(0);
  expect(change).not.toHaveBeenCalled();
  expect(backend.create).not.toHaveBeenCalled();
});
