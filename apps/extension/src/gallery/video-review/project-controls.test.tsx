// @vitest-environment jsdom
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewProjectTitle, useReviewProjectCommands } from './project-controls';

it('renames on a single title click, retains a failed draft for retry, and cancels with Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const rename = vi
    .fn<(name: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('quota'))
    .mockResolvedValue(undefined);
  const render = () =>
    root.render(<ReviewProjectTitle name="Original" busy={false} onRename={rename} />);
  const edit = (value: string) => {
    const input = host.querySelector<HTMLInputElement>('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (value: string) =>
    host
      .querySelector('input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
  try {
    act(render);
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(document.activeElement).toBe(host.querySelector('input'));
    act(() => edit('  New title  '));
    await act(async () => {
      key('Enter');
    });
    expect(rename).toHaveBeenCalledExactlyOnceWith('New title');
    expect(host.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('  New title  ');
    await act(async () => {
      key('Enter');
    });
    expect(rename).toHaveBeenCalledTimes(2);
    expect(host.querySelector('input')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    act(() => edit('Discard'));
    act(() => key('Escape'));
    expect(host.querySelector('input')).toBeNull();
    expect(rename).toHaveBeenCalledTimes(2);
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    act(() => edit('   '));
    await act(async () => {
      key('Enter');
    });
    expect(rename).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('flushes project commands, releases Busy after failure, and retains New receipt through retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:source',
      formatVersion: 1,
      sourceAssetId: 'asset',
      source: { duration: 2, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      history: [],
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const created = vi.fn();
  const flush = vi.fn(async () => {});
  const rename = vi.fn(async (_name: string) => snapshot);
  const createProject = vi
    .fn(async (_receipt: string) => snapshot)
    .mockRejectedValueOnce(new Error('quota'));
  const canStart = vi.fn(() => true);
  const setBusy = vi.fn();
  const failures: unknown[] = [];
  const state = {
    session: { rename, createProject },
    canStart,
    setBusy,
    beforeAction: (action: () => void) => action(),
    run: async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    },
  };
  let commands: ReturnType<typeof useReviewProjectCommands> | undefined;
  function Harness({ enabled = true }: { enabled?: boolean }) {
    commands = useReviewProjectCommands(state, flush, enabled ? created : undefined);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() => root.render(<Harness />));
    await commands!.rename('Name');
    expect(flush).toHaveBeenCalledOnce();
    expect(rename).toHaveBeenCalledExactlyOnceWith('Name');
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
    flush.mockRejectedValueOnce(new Error('flush failed'));
    await expect(commands!.rename('Refused')).rejects.toThrow('flush failed');
    expect(rename).toHaveBeenCalledOnce();
    expect(setBusy.mock.lastCall).toEqual([false]);
    canStart.mockReturnValueOnce(false);
    await expect(commands!.rename('Busy')).rejects.toThrow('busy');
    await act(async () => commands!.newProject!());
    expect(failures).toHaveLength(1);
    expect(created).not.toHaveBeenCalled();
    await act(async () => commands!.newProject!());
    expect(createProject.mock.calls[0]).toEqual(createProject.mock.calls[1]);
    expect(created).toHaveBeenCalledExactlyOnceWith('recording:source');
    act(() => root.render(<Harness enabled={false} />));
    expect(commands!.newProject).toBeUndefined();
  } finally {
    act(() => root.unmount());
  }
});
