// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
const { markdown } = vi.hoisted(() => ({ markdown: vi.fn() }));
vi.mock('./runtime/markdown-export', () => ({ exportGuideMarkdown: markdown }));
import { GuideHtmlExport } from './html-export';
it('prevents duplicates, cancels and ignores completion after unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let done: ((value: 'saved') => void) | undefined;
  markdown.mockReset().mockImplementation(
    () =>
      new Promise<'saved'>((resolve) => {
        done = resolve;
      })
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <GuideHtmlExport
        project={createGuideProject('Guide')}
        t={createTranslator('en')}
        onOpenHtml={() => {}}
      />
    )
  );
  await act(async () => {
    host.querySelectorAll('button')[1]!.click();
    host.querySelectorAll('button')[1]!.click();
    host.querySelectorAll('button')[1]!.click();
  });
  expect(markdown).toHaveBeenCalledTimes(1);
  const args = markdown.mock.calls[0]![0];
  await act(async () => host.querySelectorAll('button')[2]!.click());
  expect(args.signal.aborted).toBe(true);
  await act(async () => root.unmount());
  await act(async () => done?.('saved'));
  vi.unstubAllGlobals();
});
it('shares command state with Markdown and reports its completion', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  markdown.mockReset().mockResolvedValue('saved');
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GuideHtmlExport
          project={createGuideProject('Guide')}
          t={createTranslator('en')}
          onOpenHtml={() => {}}
        />
      )
    );
    await act(async () => host.querySelectorAll('button')[1]!.click());
    expect(markdown).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Markdown saved');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it('shows failure, allows retry and distinguishes history failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  markdown
    .mockReset()
    .mockRejectedValueOnce(new Error('disk'))
    .mockResolvedValueOnce('history-failed');
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GuideHtmlExport
          project={createGuideProject('Guide')}
          t={createTranslator('en')}
          onOpenHtml={() => {}}
        />
      )
    );
    await act(async () => host.querySelectorAll('button')[1]!.click());
    expect(host.textContent).toContain('Could not save Markdown');
    await act(async () => host.querySelectorAll('button')[1]!.click());
    expect(host.textContent).toContain('File saved, but export history');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
