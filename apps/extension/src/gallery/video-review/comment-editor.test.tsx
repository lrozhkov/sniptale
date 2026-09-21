// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewCanvasCommentEditor, ReviewCanvasCommentsSection } from './comment-editor';
import { createCanvasComment } from '../../features/video/review/comments';
import type { CanvasComment, ReviewAnnotation } from '../../features/video/review/types';

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

const annotations: ReviewAnnotation[] = [
  { id: 'a1', text: 'Saved', anchor: { kind: 'point', time: 1 } },
];

const typeValue = (input: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

it('commits text after the debounce and switches the zoom behavior once', async () => {
  const onPatch = vi.fn((_patch: Partial<Omit<CanvasComment, 'id'>>) => undefined);
  const onSwitch = vi.fn((_attachment: CanvasComment['attachment']) => undefined);
  const onDelete = vi.fn();
  act(() => {
    root.render(
      <ReviewCanvasCommentEditor
        comment={comment()}
        annotations={annotations}
        duration={10}
        busy={false}
        onPatch={onPatch}
        onSwitchAttachment={onSwitch}
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
  expect(onSwitch).toHaveBeenCalledWith('viewport');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayVisible"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ visible: false, text: 'Hello there' });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayRenderToVideo"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ renderToVideo: false, text: 'Hello there' });
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
        annotations={annotations}
        duration={10}
        selectedId={null}
        busy={false}
        onSelect={onSelect}
        onAdd={onAdd}
        onPatch={vi.fn()}
        onSwitchAttachment={vi.fn()}
        onDraft={vi.fn()}
        onDelete={vi.fn()}
        flushTexts={vi.fn(async () => undefined)}
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

it('keeps the typed draft when the acknowledged text arrives and commits it later', async () => {
  const onPatch = vi.fn();
  const onDraft = vi.fn();
  const render = (text: string) =>
    act(() => {
      root.render(
        <ReviewCanvasCommentEditor
          comment={{ ...comment(), text }}
          annotations={annotations}
          duration={10}
          busy={false}
          onPatch={onPatch}
          onSwitchAttachment={vi.fn()}
          onDraft={onDraft}
          onDelete={vi.fn()}
        />
      );
    });
  render('Hello');
  const area = host.querySelector('textarea') as HTMLTextAreaElement;
  typeValue(area, 'A');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
  expect(onPatch).toHaveBeenCalledWith({ text: 'A' });
  typeValue(area, 'AB');
  render('A');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('AB');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
  expect(onPatch).toHaveBeenCalledWith({ text: 'AB' });
  expect(onDraft).toHaveBeenCalledWith('c1', 'AB');
});

it('commits pending text when the editor unmounts', async () => {
  const onPatch = vi.fn();
  act(() => {
    root.render(
      <ReviewCanvasCommentEditor
        comment={comment()}
        annotations={annotations}
        duration={10}
        busy={false}
        onPatch={onPatch}
        onSwitchAttachment={vi.fn()}
        onDelete={vi.fn()}
      />
    );
  });
  typeValue(host.querySelector('textarea') as HTMLTextAreaElement, 'Draft');
  await act(async () => root.unmount());
  expect(onPatch).toHaveBeenCalledWith({ text: 'Draft' });
});

it('keeps intermediate numeric input and commits the complete style with pending text on blur', async () => {
  const onPatch = vi.fn();
  await act(async () =>
    root.render(
      <ReviewCanvasCommentEditor
        comment={comment()}
        annotations={[]}
        duration={10}
        busy={false}
        onPatch={onPatch}
        onSwitchAttachment={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const area = host.querySelector('textarea')!;
  const input = host.querySelector<HTMLInputElement>('input[min="10"]')!;
  await act(async () => {
    area.focus();
    typeValue(area, 'New text');
    input.focus();
  });
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  for (const value of ['', '1', '18']) {
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe(value);
    expect(onPatch).not.toHaveBeenCalled();
  }
  await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
  expect(onPatch).not.toHaveBeenCalled();
  await act(async () => input.blur());
  expect(onPatch).toHaveBeenCalledWith({
    text: 'New text',
    style: { ...comment().style, fontSize: 18 },
  });
});
