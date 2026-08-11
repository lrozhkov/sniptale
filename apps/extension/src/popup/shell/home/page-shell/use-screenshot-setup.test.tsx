// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanupRenderedNode, getContainer, renderNode } from './popup-home.test.helpers';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../../composition/persistence/capture-settings';

const { loadMock, patchMock, toastErrorMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  patchMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
vi.mock('../../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/capture-settings')
  >()),
  loadScreenshotSetupState: loadMock,
  patchScreenshotSetupState: patchMock,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: toastErrorMock },
}));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { useScreenshotSetupState } from './use-screenshot-setup';

let latestSetup: ReturnType<typeof useScreenshotSetupState> | null = null;

function Harness() {
  const setup = useScreenshotSetupState();
  latestSetup = setup;
  return (
    <div>
      <span>
        {setup.ready ? `${setup.state.selectedMode}:${setup.state.tab.screenshotMode}` : 'loading'}
      </span>
      <button data-testid="desktop" onClick={() => setup.update({ selectedMode: 'desktop' })} />
      <button data-testid="tab" onClick={() => setup.update({ selectedMode: 'tab' })} />
      <button
        data-testid="full"
        onClick={() => setup.update({ tab: { ...setup.state.tab, screenshotMode: 'full' } })}
      />
    </div>
  );
}

function setupButton(id: 'desktop' | 'tab' | 'full'): HTMLButtonElement {
  return getContainer()?.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  latestSetup = null;
  loadMock.mockResolvedValue(DEFAULT_SCREENSHOT_SETUP_STATE);
  patchMock.mockResolvedValue({ ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'desktop' });
});
afterEach(cleanupRenderedNode);

it('restores stored setup and persists an explicit mode change', async () => {
  await renderNode(<Harness />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(getContainer()?.textContent).toBe('quick-actions:visible');
  await act(async () => {
    setupButton('desktop').click();
  });
  expect(getContainer()?.textContent).toBe('desktop:visible');
  expect(patchMock).toHaveBeenCalledWith({ selectedMode: 'desktop' });
});

it('rolls back the latest optimistic update when persistence fails', async () => {
  patchMock.mockRejectedValue(new Error('storage failed'));
  await renderNode(<Harness />);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    setupButton('desktop').click();
    await Promise.resolve();
  });
  expect(getContainer()?.textContent).toBe('quick-actions:visible');
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
});

it('rebases a newer field change when an older write fails', async () => {
  let rejectFirst: (error: Error) => void = () => undefined;
  const fullTab = { ...DEFAULT_SCREENSHOT_SETUP_STATE.tab, screenshotMode: 'full' as const };
  patchMock
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        })
    )
    .mockResolvedValueOnce({
      ...DEFAULT_SCREENSHOT_SETUP_STATE,
      selectedMode: 'desktop',
      tab: fullTab,
    });
  await renderNode(<Harness />);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    setupButton('desktop').click();
    setupButton('full').click();
    await Promise.resolve();
  });
  await act(async () => {
    rejectFirst(new Error('older write failed'));
    await Promise.resolve();
  });
  await act(async () => {
    await latestSetup?.flush();
  });
  expect(patchMock).toHaveBeenNthCalledWith(2, {
    selectedMode: 'desktop',
    tab: fullTab,
  });
  expect(getContainer()?.textContent).toBe('desktop:full');
});

it('does not let a late initial load overwrite a local selection', async () => {
  let resolveLoad: (state: typeof DEFAULT_SCREENSHOT_SETUP_STATE) => void = () => undefined;
  loadMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
  );
  await renderNode(<Harness />);
  await act(async () => {
    setupButton('desktop').click();
    resolveLoad(DEFAULT_SCREENSHOT_SETUP_STATE);
    await Promise.resolve();
  });
  await act(async () => {
    await latestSetup?.flush();
  });
  expect(getContainer()?.textContent).toBe('desktop:visible');
});

it('keeps flush rejected until a failed save is surfaced and rolled back', async () => {
  patchMock.mockRejectedValueOnce(new Error('storage failed'));
  await renderNode(<Harness />);
  await act(async () => {
    await Promise.resolve();
  });
  let observedFlush: Promise<unknown> | undefined;
  await act(async () => {
    setupButton('desktop').click();
    observedFlush = latestSetup?.flush().catch((error: unknown) => error);
    await Promise.resolve();
  });
  await expect(observedFlush).resolves.toEqual(new Error('storage failed'));
  expect(latestSetup?.savePending).toBe(false);
  expect(getContainer()?.textContent).toBe('quick-actions:visible');
});

it('fails soft when durable setup cannot be loaded', async () => {
  loadMock.mockRejectedValue(new Error('load failed'));
  await renderNode(<Harness />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(getContainer()?.textContent).toBe('quick-actions:visible');
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
});
