// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OpenProjectAction } from './cards';
import { beginProjectTransition } from '../../runtime/commands/project-transition';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('prevents duplicate project opens and restores retry after a failed switch', async () => {
  let rejectOpen: (reason?: unknown) => void = () => undefined;
  const onOpenProject = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectOpen = reject;
      })
  );
  act(() => {
    root?.render(
      <OpenProjectAction
        disabled={false}
        onOpenProject={onOpenProject}
        projectId="project-1"
        variant="row"
      />
    );
  });
  const button = container?.querySelector<HTMLButtonElement>('button');

  act(() => {
    button?.click();
    button?.click();
  });
  expect(onOpenProject).toHaveBeenCalledTimes(1);
  expect(button?.disabled).toBe(true);
  expect(button?.textContent).toContain('common.states.loading');

  await act(async () => {
    rejectOpen(new Error('save failed'));
    await Promise.resolve();
  });
  expect(button?.disabled).toBe(false);
  expect(button?.textContent).toContain('videoEditor.sidebar.openButton');
});

it('disables every project action while the shared project transition is pending', () => {
  act(() => {
    root?.render(
      <OpenProjectAction
        disabled={false}
        onOpenProject={vi.fn()}
        projectId="project-2"
        variant="row"
      />
    );
  });
  const button = container?.querySelector<HTMLButtonElement>('button');
  let transition!: ReturnType<typeof beginProjectTransition>;
  act(() => {
    transition = beginProjectTransition();
  });

  expect(button?.disabled).toBe(true);
  act(() => transition.complete());
  expect(button?.disabled).toBe(false);
});
