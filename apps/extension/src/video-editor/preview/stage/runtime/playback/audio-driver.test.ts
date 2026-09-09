// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createPreviewAudioGraphState, ensurePreviewAudioGraphNode } from './audio-graph';
import { pausePreviewAudioDriver, requestPreviewAudioDriverPlayback } from './audio-driver';
import {
  flushPreviewAudioGraphTasks,
  installPreviewAudioContextHarness,
} from './audio-graph.test-support';

afterEach(() => vi.unstubAllGlobals());

it('keeps a newer play request pending when the cancelled request rejects', async () => {
  installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const oldPlay = Promise.withResolvers<void>();
  const newPlay = Promise.withResolvers<void>();
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockReturnValueOnce(oldPlay.promise).mockReturnValueOnce(newPlay.promise);
  vi.spyOn(audio, 'pause').mockImplementation(() => {});
  ensurePreviewAudioGraphNode(state, 'clip', audio);
  const logger = createLogger({ namespace: 'TestAudio' });
  const warn = vi.spyOn(logger, 'warn');
  requestPreviewAudioDriverPlayback(state, 'clip', audio, logger);
  await flushPreviewAudioGraphTasks();
  pausePreviewAudioDriver(state, 'clip', audio);
  requestPreviewAudioDriverPlayback(state, 'clip', audio, logger);
  await flushPreviewAudioGraphTasks();
  oldPlay.reject(new DOMException('interrupted', 'AbortError'));
  await flushPreviewAudioGraphTasks();
  expect(warn).not.toHaveBeenCalled();
  expect(state.pendingPlayClipIds.has('clip')).toBe(true);
  newPlay.resolve();
  await flushPreviewAudioGraphTasks();
  expect(state.pendingPlayClipIds.has('clip')).toBe(false);
});

it('still warns when the current play request fails', async () => {
  installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const audio = document.createElement('audio');
  const error = new DOMException('blocked', 'NotAllowedError');
  vi.spyOn(audio, 'play').mockRejectedValue(error);
  ensurePreviewAudioGraphNode(state, 'clip', audio);
  const logger = createLogger({ namespace: 'TestAudio' });
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  requestPreviewAudioDriverPlayback(state, 'clip', audio, logger);
  await flushPreviewAudioGraphTasks();
  expect(warn).toHaveBeenCalledWith('Preview audio driver play() rejected', error);
});

it('does not pause a newer request when an old resume completes', async () => {
  const harness = installPreviewAudioContextHarness({ state: 'suspended' });
  const state = createPreviewAudioGraphState();
  const audio = document.createElement('audio');
  const play = vi.spyOn(audio, 'play').mockResolvedValue(undefined);
  vi.spyOn(audio, 'pause').mockImplementation(() => {});
  ensurePreviewAudioGraphNode(state, 'clip', audio);
  const resume = Promise.withResolvers<void>();
  harness.latestContext.resume.mockImplementationOnce(() => resume.promise);
  requestPreviewAudioDriverPlayback(state, 'clip', audio);
  pausePreviewAudioDriver(state, 'clip', audio);
  requestPreviewAudioDriverPlayback(state, 'clip', audio);
  harness.latestContext.state = 'running';
  resume.resolve();
  await flushPreviewAudioGraphTasks();
  expect(play).toHaveBeenCalledOnce();
});
