// @vitest-environment jsdom

import { act } from 'react';
import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  createDeferred,
  createRecordingState,
  getContainer,
  installCameraRecorderTestHarness,
  installRecordingMessageListener,
  mockRegisteredRecordingState,
  renderApp,
  sendRuntimeMessageMock,
} from './app.test-support';

installCameraRecorderTestHarness();

it('opens a draft with read-only state and disables recording commands', async () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?draft=1&teleprompter=1'
  );
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    state: createRecordingState(),
    controlToken: 'unrelated-token',
    recordingId: 'unrelated-recording',
  });
  await renderApp();
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.GET_RECORDING_STATE,
  });
  expect(getContainer()?.querySelector('textarea')).not.toBeNull();
  expect(
    Array.from(getContainer()?.querySelectorAll<HTMLButtonElement>('footer button') ?? []).every(
      (button) => button.disabled
    )
  ).toBe(true);
  expect(window.location.search).toBe('');
});

it('rebinds the mounted script to a fresh recording and ignores a late old registration', async () => {
  const oldRegistration = createDeferred<{
    success: boolean;
    result: string;
    controlToken: string;
    recordingId: string;
  }>();
  sendRuntimeMessageMock.mockReturnValueOnce(oldRegistration.promise);
  await renderApp();
  const scriptEditor = getContainer()?.querySelector('textarea');
  if (!scriptEditor) throw new Error('Script editor is unavailable');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      scriptEditor,
      'Keep this private script across recordings'
    );
    scriptEditor.dispatchEvent(new Event('input', { bubbles: true }));
    scriptEditor.dispatchEvent(new Event('change', { bubbles: true }));
  });

  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      result: 'active',
      controlToken: 'control-token-2',
      recordingId: 'rec-2',
    })
    .mockResolvedValueOnce({
      success: true,
      controlToken: 'control-token-2',
      recordingId: 'rec-2',
      state: createRecordingState(),
    });
  await act(async () => {
    window.history.replaceState(
      {},
      '',
      '/apps/extension/src/camera-recorder/index.html#recordingId=rec-2&launchToken=launch-2&teleprompter=1'
    );
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(window.location.hash).toBe('');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
    cameraRegistrationToken: 'launch-2',
    recordingId: 'rec-2',
  });
  expect(getContainer()?.querySelector('textarea')).toBe(scriptEditor);
  expect(scriptEditor.value).toBe('Keep this private script across recordings');
  await act(async () => {
    oldRegistration.resolve({
      success: true,
      result: 'active',
      controlToken: 'old-token',
      recordingId: 'rec-1',
    });
  });
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    controlToken: 'control-token-2',
    recordingId: 'rec-2',
    state: createRecordingState(),
  });
  const pauseButton = Array.from(getContainer()?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('popup.video.pauseButton')
  );
  await act(async () => {
    pauseButton?.click();
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PAUSE_RECORDING,
    controlToken: 'control-token-2',
    recordingId: 'rec-2',
  });
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ controlToken: 'old-token' })
  );
});

it('returns from a recording result to the retained draft without registering or controlling recording', async () => {
  const harness = installRecordingMessageListener();
  const result = { primaryRecordingId: 'rec-1', projectId: null, recordingId: 'rec-1' };
  mockRegisteredRecordingState();
  await renderApp();
  const scriptEditor = getContainer()?.querySelector('textarea');
  if (!scriptEditor) throw new Error('Script editor is unavailable');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      scriptEditor,
      'Retained script for the next recording'
    );
    scriptEditor.dispatchEvent(new Event('input', { bubbles: true }));
    scriptEditor.dispatchEvent(new Event('change', { bubbles: true }));
  });
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    state: createRecordingState(VideoRecordingStatus.IDLE),
    postRecordResult: result,
  });
  await harness.emitState(VideoRecordingStatus.IDLE);
  expect(getContainer()?.querySelector('[data-ui="camera-recorder.result"]')).not.toBeNull();
  const callsBeforeDraft = sendRuntimeMessageMock.mock.calls.length;
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    state: createRecordingState(VideoRecordingStatus.IDLE),
    postRecordResult: result,
    recordingId: 'rec-1',
    controlToken: 'previous-control-token',
  });
  await act(async () => {
    window.history.replaceState(
      {},
      '',
      '/apps/extension/src/camera-recorder/index.html#teleprompter=1&draft=1'
    );
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(getContainer()?.querySelector('[data-ui="camera-recorder.result"]')).toBeNull();
  expect(
    getContainer()?.querySelector('[data-ui="camera-recorder.live"]')?.parentElement?.hidden
  ).toBe(false);
  expect(getContainer()?.querySelector('textarea')).toBe(scriptEditor);
  expect(scriptEditor.value).toBe('Retained script for the next recording');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      scriptEditor,
      'Edited draft for the next recording'
    );
    scriptEditor.dispatchEvent(new Event('input', { bubbles: true }));
    scriptEditor.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(scriptEditor.value).toBe('Edited draft for the next recording');
  expect(sendRuntimeMessageMock.mock.calls.slice(callsBeforeDraft)).toEqual([
    [{ type: VideoMessageType.GET_RECORDING_STATE }],
  ]);
  const controls = Array.from(
    getContainer()?.querySelectorAll<HTMLButtonElement>('footer button') ?? []
  );
  expect(controls.length).toBeGreaterThan(0);
  expect(controls.every((button) => button.disabled)).toBe(true);
  await act(async () => {
    for (const button of controls) button.click();
  });
  expect(sendRuntimeMessageMock.mock.calls.length).toBe(callsBeforeDraft + 1);
});

it('permits script rehearsal in an idle draft without recording authority', async () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?draft=1&teleprompter=1'
  );
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    state: createRecordingState(VideoRecordingStatus.IDLE),
  });
  await renderApp();
  const editor = getContainer()?.querySelector('textarea');
  if (!editor) throw new Error('Missing rehearsal script');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      editor,
      'Rehearse before recording'
    );
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const read = getContainer()?.querySelector<HTMLButtonElement>(
    '[aria-label="popup.video.teleprompterRead"]'
  );
  act(() => read?.click());
  const start = getContainer()?.querySelector<HTMLButtonElement>(
    '[aria-label="popup.video.teleprompterPlay"]'
  );
  expect(start).not.toBeNull();
  expect(start?.disabled).toBe(false);
  expect(
    Array.from(getContainer()?.querySelectorAll<HTMLButtonElement>('footer button') ?? []).every(
      (button) => button.disabled
    )
  ).toBe(true);
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
});
