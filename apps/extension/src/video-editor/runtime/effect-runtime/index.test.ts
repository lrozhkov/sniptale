// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeSandboxExecutor } from '../../../contracts/effect-runtime/types';
import { readEffectRuntimeSandboxConnectionNonce } from '../../../contracts/effect-runtime/sandbox-connection';
import {
  createSandboxInputBitmap,
  createSandboxRenderRequest,
  FakeImageBitmap,
} from '../../../workflows/video/effect-runtime-sandbox.test-support';
import {
  createVideoEditorEffectPreparationExecutor,
  createVideoEditorEffectRuntime,
} from './index';

const getUrl = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/platform/browser/runtime', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: getUrl },
}));
const executors: EffectRuntimeSandboxExecutor[] = [];
beforeEach(() => {
  document.body.replaceChildren();
  getUrl.mockReturnValue('chrome-extension://test/effect-runtime-sandbox.html');
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
});
afterEach(() => {
  for (const executor of executors.splice(0)) executor.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('keeps advisory bitmap refusal and disposal separate from the foreground session', async () => {
  const primary = createVideoEditorEffectRuntime({ ownerDocument: document });
  executors.push(primary.executor);
  const primaryFrame = document.querySelector('iframe');
  if (!primaryFrame) throw new Error('Expected a foreground sandbox.');
  const primaryInput = createSandboxInputBitmap();
  const pending = primary.executor.renderFrame(createSandboxRenderRequest(primaryInput));
  const advisory = createVideoEditorEffectPreparationExecutor(document);
  executors.push(advisory);
  const frames = [...document.querySelectorAll('iframe')];
  const advisoryFrame = frames.find((frame) => frame !== primaryFrame);
  if (!advisoryFrame) throw new Error('Expected a separate advisory sandbox.');
  const primaryUrl = new URL(primaryFrame.src),
    advisoryUrl = new URL(advisoryFrame.src);
  expect(primaryUrl.searchParams.get('composition')).toBe('gpu-scene');
  expect(advisoryUrl.searchParams.get('composition')).toBe('gpu-scene-plan');
  expect(readEffectRuntimeSandboxConnectionNonce(advisoryUrl.hash)).not.toBeNull();
  expect(advisoryUrl.hash).not.toBe(primaryUrl.hash);
  const refusedInput = createSandboxInputBitmap();
  await expect(
    advisory.renderFrame(createSandboxRenderRequest(refusedInput))
  ).resolves.toMatchObject({
    kind: 'error',
    code: 'inputRejected',
  });
  expect(refusedInput.close).toHaveBeenCalledOnce();
  advisory.dispose();
  expect(advisoryFrame.isConnected).toBe(false);
  expect(primaryFrame.isConnected).toBe(true);
  primary.dispose();
  await expect(pending).resolves.toMatchObject({ kind: 'error', code: 'crashed' });
  expect(primaryInput.close).toHaveBeenCalledOnce();
});
