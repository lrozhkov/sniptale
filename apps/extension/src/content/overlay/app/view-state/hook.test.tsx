// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';

const mocks = vi.hoisted(() => ({
  mode: vi.fn(),
  pin: vi.fn(async () => true),
  autoBlur: vi.fn(
    (params: {
      autoApplyAllowed: boolean;
      ensurePinned(source?: ContentPrivilegedActionIntentSource): Promise<boolean>;
    }) => params
  ),
}));
vi.mock('../mode', () => ({ useContentAppModeState: mocks.mode }));
vi.mock('../controllers', () => ({
  useContentAppControllers: () => ({
    screenshotController: { handleTakeScreenshot: vi.fn(), invalidateScreenshotRuns: vi.fn() },
    modeController: {},
  }),
}));
vi.mock('../bindings', () => ({ useContentAppBindings: () => ({}) }));
vi.mock('../message-bridge/react', () => ({ useContentRuntimeBridge: vi.fn() }));
vi.mock('../../auto-blur/controller', () => ({ useAutoBlurController: mocks.autoBlur }));
vi.mock('../../ai/pick/runtime/lazy', () => ({ disableAiPickModeIfLoaded: vi.fn() }));

import { useContentAppViewModel } from './hook';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
function Harness() {
  useContentAppViewModel({ InteractiveFrameComponent: () => null, preloadAIModal: async () => {} });
  return null;
}
async function render(state: {
  pinToTabConfirmed: boolean;
  pinToTabAutomaticallyConfirmed?: boolean;
}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.mode.mockReturnValue({ ...state, setPinToTab: mocks.pin });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { state: { pinToTabConfirmed: false }, allowed: false },
  { state: { pinToTabConfirmed: true }, allowed: true },
  { state: { pinToTabConfirmed: true, pinToTabAutomaticallyConfirmed: true }, allowed: false },
])('passes auto-blur admission for $state as $allowed', async ({ state, allowed }) => {
  await render(state);
  expect(mocks.autoBlur).toHaveBeenCalledWith(
    expect.objectContaining({ autoApplyAllowed: allowed })
  );
});

it('keeps explicit pin confirmation bound to the user source after automatic restoration', async () => {
  await render({ pinToTabConfirmed: true, pinToTabAutomaticallyConfirmed: true });
  const source = { kind: 'trusted-content-event' as const };
  const params = mocks.autoBlur.mock.calls.at(-1)![0];
  await expect(params.ensurePinned(source)).resolves.toBe(true);
  expect(mocks.pin).toHaveBeenCalledWith(true, source);
});
