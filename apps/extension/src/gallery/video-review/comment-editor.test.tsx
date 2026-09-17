// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewCanvasCommentEditor, ReviewCanvasCommentsSection } from './comment-editor';
import { createCanvasComment } from '../../features/video/review/comments';
import type { CanvasComment } from '../../features/video/review/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const comment = () => ({
  ...createCanvasComment({ id: 'c1', at: 2 }),
  text: 'Hello',
});

const typeValue = (input: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

it('commits text after the debounce and switches the zoom behavior once', async () => {
  const onPatch = vi.fn((_patch: Partial<Omit<CanvasComment, 'id'>>) => undefined);
  const onDelete = vi.fn();
  act(() => {
    root.render(
      <ReviewCanvasCommentEditor
        comment={comment()}
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    );
  });
  const editor = host.querySelector('[data-ui="gallery.videoReview.canvasCommentEditor"]')!;
  const area = editor!.querySelector('textarea')!;
  typeValue(area, 'Hello there');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
  expect(onPatch).toHaveBeenCalledWith({ text: 'Hello there' });

  const follow = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.followVideo"]'
  )!;
  expect(follow.getAttribute('aria-pressed')).toBe('true');
  await act(async () => follow.click());
  expect(onPatch).not.toHaveBeenCalledWith({ attachment: 'content' });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.stayOnScreen"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ attachment: 'viewport' });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayVisible"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ visible: false });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayRenderToVideo"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ renderToVideo: false });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayDelete"]')!
      .click()
  );
  expect(onDelete).toHaveBeenCalled();
});

it('lists overlay comments, selects them, and adds through the section button', async () => {
  const onAdd = vi.fn();
  const onSelect = vi.fn();
  const comments = [
    createCanvasComment({ id: 'c1', at: 2 }),
    { ...createCanvasComment({ id: 'c2', at: 5 }), text: 'Second' },
  ];
  act(() => {
    root.render(
      <ReviewCanvasCommentsSection
        comments={comments}
        selectedId={null}
        busy={false}
        onSelect={onSelect}
        onAdd={onAdd}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
      />
    );
  });
  expect(host.querySelectorAll('ol li')).toHaveLength(2);
  expect(host.querySelector('[data-ui="gallery.videoReview.canvasCommentEditor"]')).toBeNull();
  await act(async () => (host.querySelectorAll('ol li button')[1] as HTMLButtonElement).click());
  expect(onSelect).toHaveBeenCalledWith('c2');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.addOverlayComment"]')!
      .click()
  );
  expect(onAdd).toHaveBeenCalled();
});
