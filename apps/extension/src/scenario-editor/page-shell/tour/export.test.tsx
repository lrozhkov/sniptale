// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
const io = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn() }));
vi.mock('../runtime/tour-html', () => ({ prepareTourHtml: io.prepare, saveTourHtml: io.save }));
import { TourHtmlExport } from './export';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
it('sends the exact prepared Blob to the isolated preview and saves the same artifact', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const create = vi.fn(() => 'blob:prepared');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  const artifact = {
    blob: new Blob(['exact']),
    filename: 'tour.html',
    projectId: 'project',
    mediaCount: 1,
  };
  io.prepare.mockResolvedValue(artifact);
  io.save.mockResolvedValue('saved');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const t = createTranslator('en');
  await act(async () =>
    root.render(<TourHtmlExport project={createGuideProject('Guide')} t={t} onClose={() => {}} />)
  );
  const button = (key: 'tourHtmlPrepare' | 'htmlSave') =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.title === t(`scenario.editor.${key}`)
    )!;
  expect(button('htmlSave').disabled).toBe(true);
  await act(async () => button('tourHtmlPrepare').click());
  const frame = host.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toContain('/tour-preview-sandbox/index.html#');
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  act(() => frame.dispatchEvent(new Event('load')));
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'tour-preview', blob: artifact.blob }),
    '*'
  );
  expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
  expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  await act(async () => button('htmlSave').click());
  expect(io.save.mock.calls[0]![0]).toBe(artifact);
  await act(async () => root.unmount());
  expect(revoke).not.toHaveBeenCalled();
  host.remove();
});
it('rejects duplicate jobs and discards preparation after project replacement', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const create = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = vi.fn();
    }
  );
  let resolve!: (value: unknown) => void;
  io.prepare.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const t = createTranslator('en');
  const render = async () =>
    act(async () =>
      root.render(<TourHtmlExport project={createGuideProject('Guide')} t={t} onClose={() => {}} />)
    );
  await render();
  const prepare = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.title === t('scenario.editor.tourHtmlPrepare')
  )!;
  await act(async () => {
    prepare.click();
    prepare.click();
  });
  expect(io.prepare).toHaveBeenCalledTimes(1);
  const signal = io.prepare.mock.calls[0]![0].signal;
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ blob: new Blob(['stale']) }));
  expect(create).not.toHaveBeenCalled();
  expect(host.querySelector('iframe')).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it('invalidates preview when compression changes and supports retry, replay, cancellation and close', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const t = createTranslator('en');
  const close = vi.fn();
  const artifact = {
    blob: new Blob(['exact']),
    filename: 'tour.html',
    projectId: 'project',
    mediaCount: 1,
  };
  io.prepare.mockResolvedValue(artifact);
  io.save.mockResolvedValue('history-failed');
  await act(async () =>
    root.render(<TourHtmlExport project={createGuideProject('Guide')} t={t} onClose={close} />)
  );
  const action = async (key: 'tourHtmlPrepare' | 'htmlSave' | 'tourCameraReplay') =>
    act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((node) => node.title === t(`scenario.editor.${key}`))!
        .click();
    });
  const select = async (
    key: 'htmlImages' | 'tourHtmlResolution' | 'tourHtmlQuality' | 'tourHtmlPreview',
    index: number
  ) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(`button[aria-label="${t(`scenario.editor.${key}`)}"]`)!
        .click()
    );
    await act(async () =>
      document.querySelectorAll<HTMLElement>('[role="option"]')[index]!.click()
    );
  };
  await action('tourHtmlPrepare');
  const first = host.querySelector('iframe');
  await action('tourCameraReplay');
  expect(host.querySelector('iframe')).not.toBe(first);
  await select('tourHtmlPreview', 1);
  expect(host.querySelector('.tour-export-frame')?.getAttribute('data-viewport')).toBe('mobile');
  await select('htmlImages', 1);
  expect(host.querySelector('iframe')).toBeNull();
  await select('tourHtmlResolution', 0);
  await select('tourHtmlQuality', 2);
  await action('tourHtmlPrepare');
  expect(io.prepare.mock.calls.at(-1)?.[0].options).toEqual({
    optimize: true,
    maxEdge: 1280,
    quality: 0.95,
  });
  await action('htmlSave');
  expect(host.textContent).toContain(t('scenario.editor.guideHtmlHistoryFailed'));
  io.prepare.mockRejectedValueOnce(new Error('decode'));
  await action('tourHtmlPrepare');
  expect(host.textContent).toContain(t('scenario.editor.tourHtmlFailed'));
  io.prepare.mockImplementationOnce(() => new Promise(() => {}));
  await action('tourHtmlPrepare');
  const signal = io.prepare.mock.calls.at(-1)?.[0].signal;
  await act(async () =>
    host.querySelector<HTMLButtonElement>(`button[title="${t('common.actions.cancel')}"]`)!.click()
  );
  expect(signal.aborted).toBe(true);
  act(() =>
    host
      .querySelector('main')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(close).toHaveBeenCalledOnce();
  act(() => root.unmount());
  host.remove();
});
