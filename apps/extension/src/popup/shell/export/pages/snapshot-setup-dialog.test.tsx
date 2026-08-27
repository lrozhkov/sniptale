// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WebSnapshotSetupDialog } from './snapshot-setup-dialog';

it('renders a compact dismissible setup dialog with the Settings action', () => {
  const onClose = vi.fn();
  const onOpenSettings = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <WebSnapshotSetupDialog onClose={onClose} onOpenSettings={onOpenSettings} status="loaded" />
    )
  );
  const buttons = container.querySelectorAll<HTMLButtonElement>('button');
  act(() => buttons[buttons.length - 1]?.click());
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
  act(() => buttons[buttons.length - 2]?.click());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[class*="overflow-y-auto"]')).toBeNull();
  act(() => root.unmount());
});
