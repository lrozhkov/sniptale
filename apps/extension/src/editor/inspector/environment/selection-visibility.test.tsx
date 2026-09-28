// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const patchDefaults = vi.hoisted(() => vi.fn());
vi.mock('../../persistence/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/workspace')>()),
  patchEditorWorkspaceDefaults: patchDefaults,
}));

import { useEditorStore } from '../../state/useEditorStore';
import { SelectionVisibilitySetting } from './selection-visibility';

afterEach(() => {
  useEditorStore.getState().updateWorkspace({ hideSelectionWhileDragging: true });
  patchDefaults.mockReset();
});

it('persists the visibility switch and restores it if storage rejects the change', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  useEditorStore.getState().updateWorkspace({ hideSelectionWhileDragging: true });
  await act(async () => root.render(<SelectionVisibilitySetting />));
  const toggle = host.querySelector(
    '[data-ui="editor.workspace.selection-visibility"] button'
  ) as HTMLButtonElement;
  expect(toggle.getAttribute('aria-pressed')).toBe('true');

  patchDefaults.mockResolvedValueOnce({
    backgroundColor: '#ffffff',
    hideSelectionWhileDragging: false,
  });
  await act(async () => toggle.click());
  expect(patchDefaults).toHaveBeenCalledWith({ hideSelectionWhileDragging: false });
  expect(toggle.getAttribute('aria-pressed')).toBe('false');

  patchDefaults.mockRejectedValueOnce(new Error('storage unavailable'));
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();

  await act(async () => root.unmount());
  host.remove();
});
