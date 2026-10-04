// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
const { markdown, html } = vi.hoisted(() => ({ markdown: vi.fn(), html: vi.fn() }));
vi.mock('./runtime/html-export', () => ({ exportGuideHtml: html }));
vi.mock('./runtime/markdown-export', () => ({ exportGuideMarkdown: markdown }));
import { MissingGuideHtmlImageError } from './runtime/html-images';
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
      <GuideHtmlExport project={createGuideProject('Guide')} t={createTranslator('en')} />
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
        <GuideHtmlExport project={createGuideProject('Guide')} t={createTranslator('en')} />
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
        <GuideHtmlExport project={createGuideProject('Guide')} t={createTranslator('en')} />
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

it('downloads HTML directly with the clicked reading options and no intermediate screen', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  html.mockReset().mockResolvedValue('saved');
  const host = document.createElement('div');
  const root = createRoot(host);
  const project = createGuideProject('Snapshot');
  try {
    await act(async () =>
      root.render(
        <GuideHtmlExport
          project={project}
          t={createTranslator('en')}
          reading={{ mode: 'steps', navigation: 'side' }}
        />
      )
    );
    await act(async () => host.querySelector('button')!.click());
    expect(html).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        project,
        reading: { mode: 'steps', navigation: 'side' },
        theme: 'light',
      })
    );
    expect(host.textContent).toContain('HTML saved');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('locks both formats, retains the clicked snapshot, cancels and retries HTML', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  markdown.mockReset();
  let reject: ((reason: Error) => void) | undefined;
  html
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    )
    .mockResolvedValueOnce('history-failed');
  const host = document.createElement('div');
  const root = createRoot(host);
  const original = createGuideProject('Original');
  const render = (project = original) =>
    root.render(
      <GuideHtmlExport
        project={project}
        reading={{ mode: project === original ? 'steps' : 'flow', navigation: 'side' }}
        t={createTranslator('en')}
      />
    );
  try {
    await act(async () => render());
    await act(async () => {
      host.querySelectorAll('button')[0]!.click();
      host.querySelectorAll('button')[0]!.click();
      host.querySelectorAll('button')[1]!.click();
    });
    expect(html).toHaveBeenCalledTimes(1);
    expect(markdown).not.toHaveBeenCalled();
    await act(async () => render({ ...original, name: 'New' }));
    expect(html.mock.calls[0]?.[0]).toMatchObject({
      project: { name: 'Original' },
      reading: { mode: 'steps' },
    });
    await act(async () => host.querySelectorAll('button')[2]!.click());
    expect(html.mock.calls[0]?.[0].signal.aborted).toBe(true);
    await act(async () => reject?.(new DOMException('Cancelled', 'AbortError')));
    expect(host.querySelector('[role="status"]')).toBeNull();
    await act(async () => host.querySelector('button')!.click());
    expect(html.mock.calls[1]?.[0]).toMatchObject({
      project: { name: 'New' },
      reading: { mode: 'flow' },
    });
    expect(host.textContent).toContain('File saved, but export history');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
it('reports the missing image occurrence and permits a successful retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  html
    .mockReset()
    .mockRejectedValueOnce(new MissingGuideHtmlImageError('missing'))
    .mockResolvedValueOnce('saved');
  const project = createGuideProject('Guide');
  const step = createGuideStep('Step');
  step.blocks = [
    createGuideImageBlock({
      id: 'missing',
      assetId: 'asset',
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  project.items = [step];
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<GuideHtmlExport project={project} t={createTranslator('en')} />)
    );
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('Image #1 is unavailable');
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('HTML saved');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
