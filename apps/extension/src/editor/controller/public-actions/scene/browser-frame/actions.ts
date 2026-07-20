import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import { upsertBrowserFrameLayer } from './upsert';
import type { BrowserFrameActionOptions } from './types';

export async function applyEditorBrowserFrameSettings(
  options: BrowserFrameActionOptions & { browserFrame: BrowserFrameState }
): Promise<void> {
  const nextBrowserFrame = { ...options.store.getBrowserFrame(), ...options.browserFrame };
  options.store.setBrowserFrame(nextBrowserFrame);

  const applied = await upsertBrowserFrameLayer(options, nextBrowserFrame);
  if (!applied) {
    options.syncRuntimeState();
    return;
  }

  options.commitHistory();
  options.syncRuntimeState();
}

export async function previewEditorBrowserFrameSettings(_options?: unknown): Promise<void> {}

export async function removeEditorBrowserFrameSettings(_options?: unknown): Promise<void> {}

export async function previewRemoveEditorBrowserFrameSettings(_options?: unknown): Promise<void> {}
