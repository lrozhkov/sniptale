// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { CameraPostRecordPanel } from './post-record-panel';
import * as actions from '../../workflows/media-hub/post-record-actions';
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../workflows/media-hub/post-record-actions', () => ({
  deleteVideoPostRecordResult: vi.fn().mockResolvedValue(undefined),
  downloadSavedRecordingTracks: vi.fn().mockResolvedValue(undefined),
  openLatestRecordingInGallery: vi.fn().mockResolvedValue(undefined),
  openSavedRecordingInVideoEditor: vi.fn().mockResolvedValue(undefined),
}));
const result = { recordingId: 'recording', primaryRecordingId: 'primary', projectId: 'project' };
let root: Root;
let host: HTMLDivElement;
const acknowledge = vi.fn().mockResolvedValue(undefined);
const button = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === name
  )!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  vi.spyOn(window, 'close').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  host = document.createElement('div');
  host.dataset['recordingSurface'] = '';
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <CommandPressScope value>
        <CameraPostRecordPanel result={result} onAcknowledge={acknowledge} />
      </CommandPressScope>
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses the product confirmation, starts on Cancel and restores its trigger without deletion', () => {
  const trigger = button('popup.video.postRecordDelete');
  trigger.focus();
  act(() => trigger.click());
  const dialog = host.querySelector('[role="alertdialog"]');
  expect(dialog).not.toBeNull();
  expect(document.activeElement?.textContent).toBe('common.actions.cancel');
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(actions.deleteVideoPostRecordResult).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
});

it('deletes only after explicit confirmation, then acknowledges and closes', async () => {
  act(() => button('popup.video.postRecordDelete').click());
  const confirm = host.querySelector<HTMLButtonElement>(
    '[role="alertdialog"] .sniptale-confirm-actions button:last-child'
  )!;
  await act(async () => {
    confirm.click();
    await Promise.resolve();
  });
  expect(actions.deleteVideoPostRecordResult).toHaveBeenCalledExactlyOnceWith(result);
  expect(acknowledge).toHaveBeenCalledOnce();
  expect(window.close).toHaveBeenCalledOnce();
});

it('cancels confirmation when the recording surface moves without deleting the result', () => {
  const trigger = button('popup.video.postRecordDelete');
  trigger.focus();
  act(() => trigger.click());
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  act(() => host.dispatchEvent(new Event('sniptale-recording-surface-change')));
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(actions.deleteVideoPostRecordResult).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
});

it('preserves the result on a failed action and permits an explicit retry', async () => {
  vi.mocked(actions.openSavedRecordingInVideoEditor).mockRejectedValueOnce(
    new Error('Unavailable')
  );
  await act(async () => {
    button('popup.video.postRecordOpenEditor').click();
    await Promise.resolve();
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'popup.video.postRecordActionError'
  );
  expect(acknowledge).not.toHaveBeenCalled();
  expect(window.close).not.toHaveBeenCalled();
  await act(async () => {
    button('popup.video.postRecordOpenEditor').click();
    await Promise.resolve();
  });
  expect(acknowledge).toHaveBeenCalledOnce();
  expect(window.close).toHaveBeenCalledOnce();
});
