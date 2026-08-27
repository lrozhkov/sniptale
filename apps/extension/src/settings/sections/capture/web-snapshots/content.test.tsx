// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WebSnapshotsContent } from './content';

function createState(overrides: Record<string, unknown> = {}) {
  return {
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: true,
    locale: 'ru' as const,
    pendingSetting: null,
    saveFailed: false,
    updateAnonymousCrossOriginSnapshotAssetsEnabled: vi.fn(),
    updateAuthenticatedSnapshotAssetsEnabled: vi.fn(),
    updateWebSnapshotEnabled: vi.fn(),
    webSnapshotEnabled: false,
    ...overrides,
  };
}

it('explains the feature and keeps resource controls disabled until explicit opt-in', () => {
  const updateEnabled = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <WebSnapshotsContent state={createState({ updateWebSnapshotEnabled: updateEnabled })} />
    )
  );
  const switches = container.querySelectorAll<HTMLButtonElement>('button');

  expect(switches).toHaveLength(3);
  expect(switches[0]?.disabled).toBe(false);
  expect(switches[1]?.disabled).toBe(true);
  expect(switches[2]?.disabled).toBe(true);
  expect(container.textContent).toContain('текст, структуру, стили, изображения');
  expect(container.textContent).toContain('Проверьте перед отправкой');
  act(() => switches[0]?.click());
  expect(updateEnabled).toHaveBeenCalledWith(true);
  act(() => root.unmount());
});

it('allows resource choices after opt-in and exposes save failure accessibly', () => {
  const updateExternal = vi.fn();
  const updateCurrentSite = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <WebSnapshotsContent
        state={createState({
          saveFailed: true,
          updateAnonymousCrossOriginSnapshotAssetsEnabled: updateExternal,
          updateAuthenticatedSnapshotAssetsEnabled: updateCurrentSite,
          webSnapshotEnabled: true,
        })}
      />
    )
  );
  const switches = container.querySelectorAll<HTMLButtonElement>('button');
  act(() => switches[1]?.click());
  act(() => switches[2]?.click());

  expect(updateCurrentSite).toHaveBeenCalledWith(false);
  expect(updateExternal).toHaveBeenCalledWith(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Не удалось');
  act(() => root.unmount());
});
