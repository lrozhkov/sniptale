// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextDocumentPanel } from './text-panel';
import { useReviewText } from './use-review-text';
import type {
  ReviewTextDocument,
  ReviewTextFragment,
} from '../../features/video/review/text-document';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./use-speech', () => ({
  useReviewSpeech: () => {
    throw new Error('Text editing must not mount an audio job controller');
  },
}));

let host: HTMLDivElement;
let root: Root;
let current: ReviewTextDocument;
const seek = vi.fn();
const phrase = (index: number): ReviewTextFragment => ({
  id: `text-${index}`,
  text: `Phrase ${index}`,
  originalText: '',
  start: index * 4,
  end: index * 4 + 3,
  timeDomain: 'result',
  revision: 0,
  timingRevision: 0,
  alignment: 'manual',
  showInVideo: true,
});
function Fixture({ count = 120 }: { count?: number }) {
  const document = useRef<ReviewTextDocument>({
    version: 1,
    fragments: Array.from({ length: count }, (_, index) => phrase(index)),
  });
  const [, refresh] = useState(0);
  current = document.current;
  const editor = useReviewText({
    document: document.current,
    sourceDuration: 600,
    edits: [],
    sourceTime: 0,
    setText: (update) => {
      document.current = update(document.current) ?? { version: 1, fragments: [] };
      refresh((version) => version + 1);
    },
    select: vi.fn(),
    seek,
    pause: vi.fn(),
  });
  return <ReviewTextDocumentPanel editor={editor} snapshots={[]} busy={false} />;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  seek.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${label}"]`)!;

it('edits, hides and removes canonical text without changing timing or mounting an audio controller', () => {
  act(() => root.render(<Fixture count={1} />));
  act(() => host.querySelector<HTMLButtonElement>('[data-text-id] button[aria-expanded]')!.click());
  const textarea = host.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      'Updated narration'
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(current.fragments[0]).toMatchObject({
    text: 'Updated narration',
    start: 0,
    end: 3,
    timeDomain: 'result',
    showInVideo: true,
  });
  act(() => button('textFragmentShown').click());
  expect(current.fragments[0]).toMatchObject({
    text: 'Updated narration',
    start: 0,
    end: 3,
    showInVideo: false,
  });
  expect(button('textFragmentShown').getAttribute('aria-checked')).toBe('false');
  act(() => button('textFragmentDelete').click());
  expect(current.fragments).toHaveLength(0);
});

it('opens exactly one card under rapid clicks, allows all closed and keeps seek separate', () => {
  act(() => root.render(<Fixture count={3} />));
  const summaries = () =>
    host.querySelectorAll<HTMLButtonElement>('[data-text-id] button[aria-expanded]');
  act(() => {
    summaries()[0]!.click();
    summaries()[1]!.click();
  });
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  const open = host.querySelector('[data-text-id="text-1"]')!;
  expect(open.querySelector('button[aria-expanded]')?.textContent).not.toContain('Phrase 1');
  act(() =>
    open.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.speechJump"]')!.click()
  );
  expect(seek).toHaveBeenCalledWith(4, false);
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  act(() => summaries()[1]!.click());
  expect(host.querySelectorAll('textarea')).toHaveLength(0);
});

it('selects all matching phrases beyond the first fifty rendered rows and removes text in one action', () => {
  act(() => root.render(<Fixture />));
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.textPhrase"]')).toHaveLength(50);
  act(() => button('speechBatch').click());
  act(() => button('textFragmentSelectFound').click());
  expect(host.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(50);
  expect(button('textFragmentDelete').disabled).toBe(false);
  act(() => button('textFragmentDelete').click());
  expect(current.fragments).toHaveLength(0);
});

it('creates an empty manual fragment without mounting speech API and focuses its editor', () => {
  act(() => root.render(<Fixture count={1} />));
  act(() => button('textFragmentAdd').click());
  expect(current.fragments).toHaveLength(2);
  const created = current.fragments[1]!;
  expect(created).toMatchObject({ text: '', start: 0, end: 3, alignment: 'manual' });
  expect(document.activeElement).toBe(host.querySelector('textarea'));
});

it('keeps large documents paged when a new fragment opens beyond the rendered page', () => {
  act(() => root.render(<Fixture />));
  act(() => button('textFragmentAdd').click());
  expect(current.fragments).toHaveLength(121);
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.textPhrase"]')).toHaveLength(51);
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  expect(document.activeElement).toBe(host.querySelector('textarea'));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
});

it('limits batch deletion to matching selection and resets an empty search without losing other text', () => {
  act(() => root.render(<Fixture />));
  act(() => button('speechBatch').click());
  act(() => button('textFragmentSelectFound').click());
  act(() => button('textFragmentFilters').click());
  const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  const input = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        value
      );
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
  input('Phrase 119');
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.textPhrase"]')).toHaveLength(1);
  act(() => button('textFragmentDelete').click());
  expect(current.fragments).toHaveLength(119);
  expect(current.fragments.some((entry) => entry.id === 'text-119')).toBe(false);
  expect(button('textFragmentDelete').disabled).toBe(true);
  act(() => button('textFragmentResetFilters').click());
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.textPhrase"]')).toHaveLength(50);
  act(() => button('speechDeselectAll').click());
  expect(host.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
});
