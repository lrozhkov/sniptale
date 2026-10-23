// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { ProjectSubtitles } from './subtitles';

vi.mock('../../../platform/i18n', () => ({ translate: (key: string) => key }));
const container = document.createElement('div');
let root: ReturnType<typeof createRoot>;
const createUrl = vi.fn(() => 'blob:subtitles');
const revokeUrl = vi.fn();
const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
function fixture() {
  const project = createEmptyVideoProject();
  project.version = 5;
  project.duration = 10;
  project.textDocuments = [
    {
      id: 'text',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            start: 2,
            end: 4,
            text: 'Hello',
            originalText: '',
            timeDomain: 'result',
            alignment: 'manual',
            revision: 0,
            timingRevision: 0,
            showInVideo: false,
          },
        ],
      },
    },
  ];
  return project;
}
function downloadButton() {
  const button = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === 'gallery.videoReview.subtitlesDownload'
  );
  if (!button) throw new Error('Missing download action');
  return button;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  root = createRoot(container);
  document.body.append(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('downloads editable text independently from video export and releases URLs on retry and disposal', () => {
  act(() => root.render(<ProjectSubtitles project={fixture()} />));
  act(() => downloadButton().click());
  expect(click).toHaveBeenCalledOnce();
  expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.videoReview.subtitlesDownloadStarted'
  );
  act(() => downloadButton().click());
  expect(revokeUrl).toHaveBeenCalledOnce();
  act(() => root.unmount());
  expect(revokeUrl).toHaveBeenCalledTimes(2);
});
it('disables download for empty text and respects the shown-only checkbox without modifying the project', () => {
  const project = fixture();
  const before = structuredClone(project);
  act(() => root.render(<ProjectSubtitles project={project} />));
  const toggle = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="gallery.videoReview.subtitlesOnlyShown"]'
  );
  expect(toggle).not.toBeNull();
  act(() => toggle!.click());
  expect(downloadButton().disabled).toBe(true);
  act(() => toggle?.click());
  expect(downloadButton().disabled).toBe(false);
  expect(project).toEqual(before);
});
it('keeps a failed download retryable', () => {
  createUrl.mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  act(() => root.render(<ProjectSubtitles project={fixture()} />));
  act(() => downloadButton().click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.videoReview.subtitlesDownloadFailed'
  );
  act(() => downloadButton().click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.videoReview.subtitlesDownloadStarted'
  );
});

it('uses structural disclosure and preserves deferred normalization across format changes', () => {
  act(() => root.render(<ProjectSubtitles project={fixture()} />));
  const disclosure = container.querySelector('details')!;
  expect(disclosure.classList.contains('sniptale-disclosure')).toBe(true);
  expect(disclosure.dataset['variant']).toBe('structural');
  expect(disclosure.open).toBe(false);
  const normalize = () =>
    container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="gallery.videoReview.subtitlesNormalize"]'
    );
  expect(normalize()?.checked).toBe(false);
  act(() => normalize()!.click());
  expect(normalize()?.checked).toBe(true);
  expect(click).not.toHaveBeenCalled();
  const format = container.querySelector('[aria-label="gallery.videoReview.subtitlesFormat"]')!;
  act(() =>
    format
      .querySelector<HTMLButtonElement>('[title="gallery.videoReview.subtitlesWebVtt"]')!
      .click()
  );
  expect(normalize()).toBeNull();
  act(() =>
    format.querySelector<HTMLButtonElement>('[title="gallery.videoReview.subtitlesSrt"]')!.click()
  );
  expect(normalize()?.checked).toBe(true);
  expect(click).not.toHaveBeenCalled();
  expect(container.textContent).toContain('videoEditor.exportDialog.scopeProjectLabel');
});
