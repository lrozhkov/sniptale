// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { VideoSavingPanel } from './saving';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('shows a saving loader with user-facing wait copy', () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<VideoSavingPanel />);
  });

  expect(container?.textContent).toContain('popup.video.savingTitle');
  expect(container?.textContent).toContain('popup.video.savingDescription');
  expect(container?.querySelector('.animate-spin')).not.toBeNull();
});
