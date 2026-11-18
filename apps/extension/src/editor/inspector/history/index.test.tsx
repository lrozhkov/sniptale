// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import type { EditorHistoryEntry } from '../../../features/editor-history/action';
import { useEditorStore } from '../../state/useEditorStore';

const mocks = vi.hoisted(() => ({
  entries: [] as EditorHistoryEntry[],
  seek: vi.fn<(index: number) => Promise<void>>(),
}));

vi.mock('../../application/controller-context', () => ({
  useEditorController: () => ({ getHistoryEntries: () => mocks.entries, seekHistory: mocks.seek }),
}));
vi.mock('../../runtime/async-actions', () => ({
  runAndReportEditorAction: (_label: string, action: () => Promise<void>) => action(),
}));
import { EditorInspectorHistory } from './index';

const historyPanel = (
  <EditorInspectorHistory
    hasImage
    renderRestoreConfirmation={(_anchorEl, _historyIndex, onClose) => (
      <div role="dialog">
        <button onClick={onClose}>Cancel</button>
      </div>
    )}
  />
);

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.seek.mockReset().mockResolvedValue(undefined);
  mocks.entries = [
    { index: 0, action: null, pending: false },
    { index: 1, action: { operation: 'move', target: { id: 'a', name: 'Title' } }, pending: false },
    { index: 2, action: { operation: 'move', target: { id: 'a', name: 'Title' } }, pending: false },
    {
      index: 3,
      action: {
        operation: 'fill',
        target: { id: 'a', name: 'Title' },
        color: { before: '#000000', after: '#c759ed' },
      },
      pending: false,
    },
  ];
  useEditorStore.setState({ history: { canUndo: true, canRedo: true, index: 1, size: 4 } });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('selects only the current leaf and keeps visual groups passive and future states distinct', async () => {
  act(() => root.render(historyPanel));
  const rows = host.querySelectorAll<HTMLButtonElement>(
    '[data-ui="editor.inspector.history.entry"]'
  );
  expect(rows).toHaveLength(4);
  expect(host.querySelectorAll('[aria-current]')).toHaveLength(1);
  expect(rows[1]?.getAttribute('aria-current')).toBe('step');
  expect(rows[2]?.hasAttribute('data-future')).toBe(true);
  const group = host.querySelector('[data-grouped]');
  expect(group?.getAttribute('tabindex')).toBeNull();
  expect(group?.getAttribute('aria-current')).toBeNull();
  expect(group?.querySelectorAll('button')).toHaveLength(2);
  expect(host.textContent).not.toMatch(/Шаг \d|Step \d|2 действия|X:|синюю/);
  expect(rows[3]?.textContent).toContain(translate('editor.history.operations.fill'));
  expect(rows[3]?.querySelector('[aria-label="#c759ed"]')).not.toBeNull();
  await act(async () => rows[2]?.click());
  expect(mocks.seek).toHaveBeenCalledWith(2);
});

it('limits duplicate jump requests and permits retry after a failed apply', async () => {
  let reject: (error: Error) => void = () => undefined;
  mocks.seek.mockReturnValueOnce(
    new Promise<void>((_resolve, fail) => {
      reject = fail;
    })
  );
  act(() => root.render(historyPanel));
  const row = host.querySelector<HTMLButtonElement>('[data-index="0"]')!;
  act(() => row.click());
  expect(row.disabled).toBe(true);
  act(() => row.click());
  expect(mocks.seek).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('Load failed')));
  expect(row.disabled).toBe(false);
  await act(async () => row.click());
  expect(mocks.seek).toHaveBeenCalledTimes(2);
});

it('opens the existing restore confirmation and closes it on cancellation', () => {
  act(() => root.render(historyPanel));
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="editor.inspector.history.restore"]')?.click()
  );
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[role="dialog"] button')?.click());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.seek).not.toHaveBeenCalled();
});

it('shows the operation without an empty color comparison for gradients', () => {
  mocks.entries = [
    { index: 0, action: null, pending: false },
    {
      index: 1,
      action: {
        operation: 'fill',
        target: { id: 'a', name: 'Title' },
        color: { before: null, after: null },
      },
      pending: false,
    },
  ];
  act(() => root.render(historyPanel));
  expect(host.textContent).toContain(translate('editor.history.operations.fill'));
  expect(
    host.querySelector(`[aria-label="${translate('editor.history.colorChange')}"]`)
  ).toBeNull();
});
