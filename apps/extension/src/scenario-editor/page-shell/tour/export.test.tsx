// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
const io = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn() }));
vi.mock('../runtime/tour-html', async (original) => ({
  ...(await original<typeof import('../runtime/tour-html')>()),
  prepareTourHtml: io.prepare,
  saveTourHtml: io.save,
}));
import { TourHtmlPreparationError } from '../runtime/tour-html';
import { TourHtmlExport } from './export';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
it.each(['ru', 'en'] as const)(
  'passes localized player controls into the exact prepared %s artifact',
  async (locale) => {
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
    const t = createTranslator(locale);
    await act(async () =>
      root.render(<TourHtmlExport project={createGuideProject('Guide')} t={t} onClose={() => {}} />)
    );
    const main = host.querySelector('main.guide-export-workspace.tour-export')!;
    expect(main.querySelector('.guide-page-header')).toBeNull();
    const stage = main.querySelector('.guide-export-stage')!;
    const inspector = main.querySelector('.guide-export-inspector')!;
    expect(stage.querySelector('iframe')).toBeNull();
    const back = inspector.querySelector<HTMLButtonElement>('.guide-export-heading button')!;
    expect(back.title).toBe(t('scenario.editor.guideReaderBack'));
    expect(document.activeElement).toBe(back);
    expect(
      [...inspector.querySelectorAll<HTMLButtonElement>('.guide-export-actions button')].map(
        (node) => node.title
      )
    ).toEqual([t('scenario.editor.tourHtmlPrepare'), t('scenario.editor.htmlSave')]);
    const button = (key: 'tourHtmlPrepare' | 'htmlSave') =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.title === t(`scenario.editor.${key}`)
      )!;
    expect(button('htmlSave').disabled).toBe(true);
    await act(async () => button('tourHtmlPrepare').click());
    expect(io.prepare.mock.calls[0]![0].labels).toMatchObject({
      musicMute: locale === 'ru' ? 'Выключить музыку' : 'Mute music',
      musicUnmute: locale === 'ru' ? 'Включить музыку' : 'Unmute music',
      musicRetry: locale === 'ru' ? 'Повторить музыку' : 'Retry music',
      musicBlocked:
        locale === 'ru' ? 'Воспроизведение музыки заблокировано.' : 'Music playback was blocked.',
      musicError:
        locale === 'ru' ? 'Не удалось воспроизвести музыку.' : 'Music could not be played.',
      narrationReplay: locale === 'ru' ? 'Повторить озвучку' : 'Replay narration',
      narrationPause: locale === 'ru' ? 'Приостановить озвучку' : 'Pause narration',
      narrationResume: locale === 'ru' ? 'Продолжить озвучку' : 'Resume narration',
      volume: locale === 'ru' ? 'Громкость' : 'Volume',
      mute: locale === 'ru' ? 'Выключить звук' : 'Mute',
      unmute: locale === 'ru' ? 'Включить звук' : 'Unmute',
      manual: t('scenario.editor.tourManual'),
      fullView: locale === 'ru' ? 'Изображение целиком' : 'Full image',
      authoredView: locale === 'ru' ? 'Авторский вид' : 'Authored view',
      end: t('scenario.editor.tourEnd'),
    });
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
  }
);
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
  expect(host.textContent).not.toContain('decode');
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

it.each(['ru', 'en'] as const)(
  'shows the actionable %s blocker and replaces it with a retried exact preview',
  async (locale) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const t = createTranslator(locale);
    const artifact = {
      blob: new Blob(['repaired exact bytes']),
      filename: 'tour.html',
      projectId: 'project',
      mediaCount: 1,
    };
    io.prepare.mockRejectedValueOnce(
      new TourHtmlPreparationError({
        code: 'missingAudioMedia',
        slideNumber: 2,
        slideTitle: 'Checkout',
        actionNumber: 4,
      })
    );
    io.prepare.mockResolvedValueOnce(artifact);
    io.save.mockResolvedValue('saved');
    await act(async () =>
      root.render(<TourHtmlExport project={createGuideProject('Guide')} t={t} onClose={() => {}} />)
    );
    const button = (key: 'tourHtmlPrepare' | 'htmlSave') =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.title === t(`scenario.editor.${key}`)
      )!;
    await act(async () => button('tourHtmlPrepare').click());
    expect(host.textContent).toContain(t('scenario.editor.tourHtmlBlockerMissingAudioMedia'));
    expect(host.textContent).toContain('Checkout');
    expect(host.textContent).toContain(
      t('scenario.editor.tourHtmlBlockerAction').replace('{number}', '4')
    );
    expect(button('htmlSave').disabled).toBe(true);
    expect(host.querySelector('iframe')).toBeNull();
    await act(async () => button('tourHtmlPrepare').click());
    expect(host.textContent).not.toContain(t('scenario.editor.tourHtmlBlockerMissingAudioMedia'));
    expect(host.querySelector('iframe')).not.toBeNull();
    await act(async () => button('htmlSave').click());
    expect(io.save.mock.calls[0]![0]).toBe(artifact);
    await act(async () => root.unmount());
    host.remove();
  }
);

it('retains pending preparation and the exact preview after equivalent autosave publication', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const t = createTranslator('en');
  const project = createGuideProject('Guide');
  project.tour = createTourDocument();
  let resolve!: (value: unknown) => void;
  io.prepare.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  io.save.mockResolvedValue('saved');
  const render = async (current: typeof project) =>
    act(async () => root.render(<TourHtmlExport project={current} t={t} onClose={() => {}} />));
  const button = (key: 'tourHtmlPrepare' | 'htmlSave') =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.title === t(`scenario.editor.${key}`)
    )!;
  await render(project);
  await act(async () => button('tourHtmlPrepare').click());
  const signal = io.prepare.mock.calls[0]![0].signal;
  const published = structuredClone(project);
  published.updatedAt += 1;
  // Persistence publication reconstructs nested objects in a canonical property order.
  const { slides, ...rest } = published.tour!;
  published.tour = { slides, ...rest };
  await render(published);
  expect(signal.aborted).toBe(false);
  const artifact = {
    blob: new Blob(['exact saved snapshot']),
    filename: 'tour.html',
    projectId: project.id,
    mediaCount: 0,
  };
  await act(async () => resolve(artifact));
  expect(host.querySelector('iframe')).not.toBeNull();
  await render({ ...structuredClone(project), updatedAt: project.updatedAt + 2 });
  expect(host.querySelector('iframe')).not.toBeNull();
  await act(async () => button('htmlSave').click());
  expect(io.save.mock.calls[0]![0]).toBe(artifact);
  await render({
    ...published,
    tour: { ...published.tour!, slides: [createTourImageSlide('new-slide')] },
  });
  expect(host.querySelector('iframe')).toBeNull();
  expect(button('htmlSave').disabled).toBe(true);
  await act(async () => button('tourHtmlPrepare').click());
  const changedSignal = io.prepare.mock.calls.at(-1)![0].signal;
  await render({ ...published, name: 'Revised title' });
  expect(changedSignal.aborted).toBe(true);
  await act(async () => resolve(artifact));
  expect(host.querySelector('iframe')).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});
