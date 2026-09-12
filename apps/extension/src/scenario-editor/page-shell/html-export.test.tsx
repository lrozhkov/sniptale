// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./runtime/html-export', () => ({ exportGuideHtml: save }));
import { GuideHtmlExport } from './html-export';
it('prevents duplicates, cancels and ignores completion after unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let done: ((value: 'saved') => void) | undefined;
  save.mockReset().mockImplementation(
    () =>
      new Promise<'saved'>((resolve) => {
        done = resolve;
      })
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <GuideHtmlExport project={createGuideProject('Guide')} t={createTranslator('en')} />
    )
  );
  await act(async () => {
    host.querySelector('button')!.click();
    host.querySelector('button')!.click();
  });
  expect(save).toHaveBeenCalledTimes(1);
  const args = save.mock.calls[0]![0];
  await act(async () => host.querySelectorAll('button')[1]!.click());
  expect(args.signal.aborted).toBe(true);
  await act(async () => root.unmount());
  await act(async () => done?.('saved'));
  vi.unstubAllGlobals();
});
it('shows failure, allows retry and distinguishes history failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  save.mockReset().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce('history-failed');
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GuideHtmlExport project={createGuideProject('Guide')} t={createTranslator('en')} />
      )
    );
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('Could not save HTML');
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('File saved, but export history');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
