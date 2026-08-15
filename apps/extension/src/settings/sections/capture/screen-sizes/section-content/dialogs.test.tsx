// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { UserViewportPreset } from '../../../../../contracts/settings';

const calls = vi.hoisted(() => ({ editor: vi.fn(), confirm: vi.fn() }));
vi.mock('../editor', () => ({
  ViewportPresetEditor: (props: unknown) => {
    calls.editor(props);
    return null;
  },
}));
vi.mock('./viewport-confirm-dialog', () => ({
  ViewportConfirmDialog: (props: unknown) => {
    calls.confirm(props);
    return null;
  },
}));

import { PresetsDialogs } from './dialogs';

it('projects editor and confirmation contracts with and without an edited preset', () => {
  const common = {
    closeViewportDeleteDialog: vi.fn(),
    closeViewportEditor: vi.fn(),
    confirmDeleteViewport: vi.fn(async () => undefined),
    deleteMessage: 'Delete?',
    handleSaveViewportPreset: vi.fn(async () => undefined),
    isLoading: false,
    isViewportEditorOpen: true,
    viewportConfirmOpen: true,
  };
  const root = createRoot(document.createElement('div'));
  const editingViewport: UserViewportPreset = {
    enabled: true,
    height: 900,
    id: 'custom',
    kind: 'user',
    name: 'Desktop',
    order: 0,
    target: 'window',
    width: 1440,
  };
  act(() => root.render(<PresetsDialogs {...common} />));
  expect(calls.editor.mock.lastCall?.[0]).not.toHaveProperty('preset');
  act(() => root.render(<PresetsDialogs {...common} editingViewport={editingViewport} />));
  expect(calls.editor.mock.lastCall?.[0]).toHaveProperty('preset');
  expect(calls.confirm).toHaveBeenCalledWith(expect.objectContaining({ deleteMessage: 'Delete?' }));
  act(() => root.unmount());
});
