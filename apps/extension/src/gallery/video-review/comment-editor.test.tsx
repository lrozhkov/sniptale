// @vitest-environment jsdom
import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import { act, type ReactNode } from 'react';
import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewInspectorPresentation } from './inspector-sections';
import { ReviewCanvasCommentEditor, ReviewCanvasCommentsSection } from './comment-editor';
import { createCanvasComment } from '../../features/video/review/comments';
import type { CanvasComment, ReviewAnnotation } from '../../features/video/review/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

function renderEditor(node: ReactNode) {
  root.render(<InspectorLayout>{node}</InspectorLayout>);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    hideAllToasts();
  });
  expect(document.querySelectorAll('[data-ui="shared.toast.host"]')).toHaveLength(0);
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
    renderEditor(
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
  await act(async () => typeValue(area, 'Hello there'));
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
    renderEditor(
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
      renderEditor(
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
  await act(async () => typeValue(area, 'A'));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
  expect(onPatch).toHaveBeenCalledWith({ text: 'A' });
  await act(async () => typeValue(area, 'AB'));
  render('A');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('AB');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
  expect(onPatch).toHaveBeenCalledWith({ text: 'AB' });
  expect(onDraft).toHaveBeenCalledWith('c1', 'AB');
});

it('commits pending text when the editor unmounts', async () => {
  const onPatch = vi.fn();
  act(() => {
    renderEditor(
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
  await act(async () => typeValue(host.querySelector('textarea') as HTMLTextAreaElement, 'Draft'));
  await act(async () => {
    root.unmount();
    hideAllToasts();
  });
  expect(onPatch).toHaveBeenCalledWith({ text: 'Draft' });
});

it('keeps intermediate numeric input and commits the complete style with pending text on blur', async () => {
  const onPatch = vi.fn();
  await act(async () =>
    renderEditor(
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

it('groups overlay management commands in Actions in both inspector modes', async () => {
  const render = (mode: 'all' | 'sections') =>
    renderEditor(
      <ReviewInspectorPresentation value={mode}>
        <ReviewCanvasCommentEditor
          comment={comment()}
          annotations={[]}
          duration={10}
          busy={false}
          onPatch={vi.fn()}
          onSwitchAttachment={vi.fn()}
          onDelete={vi.fn()}
        />
      </ReviewInspectorPresentation>
    );
  await act(async () => render('all'));
  const remove = host.querySelector('[aria-label="gallery.videoReview.overlayDelete"]')!;
  expect(remove.closest('[data-inspector-choices]')).toBeNull();
  expect(host.querySelectorAll('[data-level="section"]')).toHaveLength(4);
  expect(remove.closest('[data-section="actions"]')).not.toBeNull();
  await act(async () => render('sections'));
  expect(host.querySelectorAll('nav button')).toHaveLength(4);
  expect(host.querySelector('textarea')).not.toBeNull();
  await act(async () => (host.querySelectorAll('nav button')[1] as HTMLButtonElement).click());
  expect(host.querySelector('input[min="10"]')).not.toBeNull();
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.querySelector('[aria-label="gallery.videoReview.overlayDelete"]')).toBeNull();
  await act(async () => (host.querySelectorAll('nav button')[3] as HTMLButtonElement).click());
  expect(
    host.querySelector('[data-section="actions"] [aria-label="gallery.videoReview.overlayDelete"]')
  ).not.toBeNull();
});

it('keeps linked annotation text read-only without copying it into appearance patches', async () => {
  const onPatch = vi.fn();
  await act(async () =>
    renderEditor(
      <ReviewCanvasCommentEditor
        comment={{ ...comment(), annotationId: 'a1' }}
        annotations={annotations}
        duration={10}
        busy={false}
        onPatch={onPatch}
        onSwitchAttachment={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const area = host.querySelector('textarea')!;
  expect(area.disabled).toBe(true);
  expect(area.readOnly).toBe(true);
  expect(area.value).toBe('');
  expect(area.placeholder).toBe('gallery.videoReview.overlayLinkedHint');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayVisible"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ visible: false });
});

it('commits a pending text draft when focus leaves the inspector', async () => {
  const onPatch = vi.fn();
  await act(async () =>
    renderEditor(
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
  await act(async () => {
    area.focus();
    typeValue(area, 'Leaving inspector');
    area.blur();
  });
  expect(onPatch).toHaveBeenCalledWith({ text: 'Leaving inspector' });
});

it('disables text editing while the existing comment is busy', async () => {
  await act(async () =>
    renderEditor(
      <ReviewCanvasCommentEditor
        comment={comment()}
        annotations={[]}
        duration={10}
        busy={true}
        onPatch={vi.fn()}
        onSwitchAttachment={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  expect(host.querySelector('textarea')!.disabled).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.overlayDelete"]')!
      .disabled
  ).toBe(true);
});

it('preserves stored numeric values when an empty draft loses focus', async () => {
  const onPatch = vi.fn();
  const stored = {
    ...comment(),
    style: { ...comment().style, width: 300, fontSize: 18, padding: 12, radius: 8 },
  };
  await act(async () =>
    renderEditor(
      <ReviewCanvasCommentEditor
        comment={stored}
        annotations={[]}
        duration={10}
        busy={false}
        onPatch={onPatch}
        onSwitchAttachment={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const input = host.querySelector<HTMLInputElement>('input[min="10"]')!;
  expect(input.value).toBe('18');
  await act(async () => {
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
  expect(input.value).toBe('18');
  expect(onPatch).toHaveBeenCalledWith({ text: 'Hello', style: stored.style });
});

it('clears the comment draft through its editor and commits after leaving the inspector', async () => {
  const onPatch = vi.fn();
  const onDraft = vi.fn();
  await act(async () =>
    renderEditor(
      <ReviewCanvasCommentEditor
        comment={comment()}
        annotations={[]}
        duration={10}
        busy={false}
        onPatch={onPatch}
        onDraft={onDraft}
        onSwitchAttachment={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const area = host.querySelector('textarea')!;
  await act(async () => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(area.value).toBe('');
  expect(document.activeElement).toBe(area);
  expect(onDraft).toHaveBeenCalledWith('c1', '');
  expect(onPatch).not.toHaveBeenCalled();
  await act(async () => area.blur());
  expect(onPatch).toHaveBeenCalledWith({ text: '' });
});

it('restores the accepted numeric value on Escape before blur acceptance', async () => {
  const onPatch = vi.fn();
  await act(async () =>
    renderEditor(
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
  const input = host.querySelector<HTMLInputElement>('input[min="10"]')!;
  await act(async () => {
    input.focus();
    input.value = '25';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(input.value).toBe('12');
  expect(document.activeElement).not.toBe(input);
  expect(onPatch).toHaveBeenCalledWith({
    text: 'Hello',
    style: { ...comment().style, fontSize: 12 },
  });
});

it.each([
  { name: 'overlayStart', value: '3', patch: { start: 3 } },
  { name: 'overlayEnd', value: '7', patch: { end: 7 } },
  { name: 'overlayWidth', value: '300', patch: { style: { width: 300 } } },
  { name: 'overlayFontSize', value: '18', patch: { style: { fontSize: 18 } } },
  { name: 'overlayPadding', value: '12', patch: { style: { padding: 12 } } },
  { name: 'overlayRadius', value: '8', patch: { style: { radius: 8 } } },
])('keeps $name passive while direct numeric editing commits', async ({ name, value, patch }) => {
  const onPatch = vi.fn();
  await act(async () =>
    renderEditor(
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
  const input = host.querySelector<HTMLInputElement>(
    `input[aria-label="gallery.videoReview.${name}"]`
  )!;
  const label = input
    .closest('.sniptale-parameter-row')!
    .querySelector<HTMLSpanElement>('.sniptale-parameter-name')!;
  await act(async () => label.click());
  expect(document.activeElement).not.toBe(input);
  expect(onPatch).not.toHaveBeenCalled();

  await act(async () => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe(value);
  expect(onPatch).not.toHaveBeenCalled();
  await act(async () => input.blur());
  expect(onPatch).toHaveBeenCalledWith(
    expect.objectContaining(
      'style' in patch ? { style: expect.objectContaining(patch.style) } : patch
    )
  );
});
