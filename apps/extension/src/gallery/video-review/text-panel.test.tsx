// @vitest-environment jsdom

import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextDocumentPanel } from './text-panel';
import { ReviewSelectedTextProperties } from './selected-properties';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewTextVoiceAccess } from './use-text-voice';
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
vi.mock('./text-rewrite-panel', () => ({
  ReviewTextRewriteForm: (props: {
    ids: readonly string[];
    wholeDocument: boolean;
    onClose(): void;
  }) => (
    <section
      data-form="rewrite"
      data-ids={props.ids.join(',')}
      data-whole={String(props.wholeDocument)}
    >
      <button onClick={props.onClose}>Back</button>
    </section>
  ),
}));
vi.mock('./text-voice-panel', () => ({
  ReviewTextVoiceForm: (props: { ids: readonly string[]; onClose(): void }) => (
    <section data-form="voice" data-ids={props.ids.join(',')}>
      <button onClick={props.onClose}>Back</button>
    </section>
  ),
}));
vi.mock('./text-subtitles-panel', () => ({
  ReviewTextSubtitlesForm: (props: {
    ids: readonly string[];
    wholeDocument: boolean;
    onClose(): void;
  }) => (
    <section
      data-form="subtitles"
      data-ids={props.ids.join(',')}
      data-whole={String(props.wholeDocument)}
    >
      <button onClick={props.onClose}>Back</button>
    </section>
  ),
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
function Fixture({
  count = 120,
  voice,
  selectedId,
}: {
  count?: number;
  voice?: ReviewTextVoiceAccess;
  selectedId?: string;
}) {
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
  return (
    <InspectorLayout>
      {selectedId ? (
        <ReviewSelectedTextProperties editor={editor} id={selectedId} busy={false} voice={voice} />
      ) : (
        <ReviewTextDocumentPanel editor={editor} snapshots={[]} busy={false} voice={voice} />
      )}
    </InspectorLayout>
  );
}
function voiceAccess(): ReviewTextVoiceAccess {
  return {
    beforeRequest: vi.fn(async () => undefined),
    session: createVideoReviewSession({
      workspace: {
        aggregateId: 'video',
        sourceAssetId: 'source',
        formatVersion: 1,
        revision: 1,
        source: { duration: 600, width: 640, height: 360, size: 5, mimeType: 'video/webm' },
        advanced: createQuickEditAdvancedState(),
        history: [],
        cursor: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    }),
  };
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

it('opens exclusive local subtitles without configured voice access and returns focus to scope trigger', () => {
  act(() => root.render(<Fixture count={3} />));
  act(() => button('subtitlesTitle').click());
  expect(host.querySelector('[data-form]')?.getAttribute('data-ids')).toBe('text-0,text-1,text-2');
  expect(host.querySelector('[data-form]')?.getAttribute('data-whole')).toBe('true');
  expect(host.querySelector('[data-ui="gallery.videoReview.textDocument"]')).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[data-form] button')!.click());
  expect(document.activeElement).toBe(button('subtitlesTitle'));
  act(() => button('speechBatch').click());
  act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  act(() => button('subtitlesSelected').click());
  expect(host.querySelector('[data-form]')?.getAttribute('data-ids')).toBe('text-0');
  expect(host.querySelector('[data-form]')?.getAttribute('data-whole')).toBe('false');
  act(() => host.querySelector<HTMLButtonElement>('[data-form] button')!.click());
  expect(document.activeElement).toBe(button('subtitlesSelected'));
});

it('opens all-text rewriting independently of search and filtered batch scope, returning focus to its trigger', () => {
  act(() => root.render(<Fixture count={3} voice={voiceAccess()} />));
  const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      search,
      'Phrase 2'
    );
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => button('textRewriteAll').click());
  expect(host.querySelector('[data-form]')?.getAttribute('data-ids')).toBe('text-0,text-1,text-2');
  expect(host.querySelector('[data-form]')?.getAttribute('data-whole')).toBe('true');
  act(() => host.querySelector<HTMLButtonElement>('[data-form] button')!.click());
  expect(document.activeElement).toBe(button('textRewriteAll'));
  expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('Phrase 2');
  act(() => button('speechBatch').click());
  act(() => button('textFragmentSelectFound').click());
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-text-voice-trigger="rewrite:batch"]')!.click()
  );
  expect(host.querySelector('[data-form]')?.getAttribute('data-ids')).toBe('text-2');
  expect(host.querySelector('[data-form]')?.getAttribute('data-whole')).toBe('false');
  act(() => host.querySelector<HTMLButtonElement>('[data-form] button')!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-text-id] button[aria-expanded]')!.click());
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-text-voice-trigger="rewrite:text-2"]')!.click()
  );
  expect(host.querySelector('[data-form="rewrite"]')).not.toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[data-form] button')!.click());
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-text-voice-trigger="fragment:text-2"]')!.click()
  );
  expect(host.querySelector('[data-form="voice"]')).not.toBeNull();
});

it('keeps a selected fragment form exclusive and drops it on selection change or deletion', () => {
  const voice = voiceAccess();
  const render = (selectedId: string) =>
    act(() => root.render(<Fixture count={2} voice={voice} selectedId={selectedId} />));
  render('text-0');
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-text-voice-trigger="rewrite:selected"]')!.click()
  );
  expect(host.querySelector('[data-form]')?.getAttribute('data-ids')).toBe('text-0');
  render('text-1');
  expect(host.querySelector('[data-form]')).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[data-text-voice-trigger="selected"]')!.click());
  expect(host.querySelector('[data-form="voice"]')?.getAttribute('data-ids')).toBe('text-1');
  act(() => host.querySelector<HTMLButtonElement>('[data-form] button')!.click());
  expect(document.activeElement).toBe(host.querySelector('[data-text-voice-trigger="selected"]'));
  render('missing');
  expect(host.childElementCount).toBe(0);
});

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

it('keeps a selected text detail distinct from an expandable numbered list row', () => {
  act(() => root.render(<Fixture count={1} selectedId="text-0" />));
  const article = host.querySelector('[data-ui="gallery.videoReview.textPhrase"]')!;
  expect(article.querySelector(':scope > div:first-child button[aria-expanded]')).toBeNull();
  expect(article.querySelector('textarea')?.rows).toBe(6);
  const timing = article.querySelector(
    'input[aria-label="gallery.videoReview.textFragmentStart"]'
  )!;
  expect(
    timing
      .closest('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
      ?.querySelector('.sniptale-numeric-entry > span')?.textContent
  ).toBeTruthy();
});
