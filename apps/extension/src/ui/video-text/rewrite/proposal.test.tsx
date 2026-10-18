// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewTextContext, ReviewTextProposal } from '../../../contracts/ai/review-text';
import { InspectorLayout } from '../../compact-inspector-controls/layout';
import { TextRewriteProposal } from './proposal';
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => (key === 'videoEditor.timeline.secondsSuffix' ? 'с' : key),
  useAppLocale: () => 'ru',
}));
let host: HTMLDivElement;
let root: Root;
const apply = vi.fn();
const discard = vi.fn();
const edited = vi.fn();
const context: ReviewTextContext = {
  version: 1,
  prompt: 'Shorten',
  mode: 'script',
  wholeDocument: true,
  changeIntervals: true,
  resegment: true,
  window: { start: 2, end: 20 },
  fragments: [
    {
      id: 'first',
      text: 'Captured first',
      start: 2.5,
      end: 12.5,
      ranges: [
        { start: 2.5, end: 3.5 },
        { start: 11.5, end: 12.5 },
      ],
    },
    { id: 'second', text: 'Captured second', start: 4, end: 5 },
  ],
};
const proposal: ReviewTextProposal = {
  version: 1,
  fragments: [{ fromIds: ['first'], text: 'New words', start: 6, end: 7 }],
};
function Proposal({
  receiptMode,
  accepted = false,
  running = false,
  pages = false,
}: {
  receiptMode?: 'replace' | 'variant';
  accepted?: boolean;
  running?: boolean;
  pages?: boolean;
}) {
  const [value, setValue] = useState(
    pages
      ? { ...proposal, fragments: Array.from({ length: 51 }, () => proposal.fragments[0]!) }
      : proposal
  );
  return (
    <InspectorLayout>
      <TextRewriteProposal
        context={context}
        proposal={value}
        running={running}
        accepted={accepted}
        receiptMode={receiptMode}
        onEdit={(updater) =>
          setValue((current) => {
            const next = updater(current);
            edited(next);
            return next;
          })
        }
        onApply={apply}
        onDiscard={discard}
      />
    </InspectorLayout>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const button = (key: string) =>
  host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!;
it('uses captured result-clock ranges and text for source mapping with localized numbers and units', async () => {
  await act(async () => root.render(<Proposal />));
  expect(host.textContent).toContain('Captured first');
  await act(async () => button('textRewriteSource').click());
  expect(document.body.textContent).toContain('2,5–3,5, 11,5–12,5 с');
  expect(document.body.textContent).toContain('Captured second');
});
it('edits the disposable result and applies the explicit variant action', async () => {
  await act(async () => root.render(<Proposal />));
  const text = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      text,
      'Edited proposal'
    );
    text.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(edited.mock.calls.at(-1)?.[0].fragments[0].text).toBe('Edited proposal');
  await act(async () => button('textRewriteVariant').click());
  expect(apply).toHaveBeenCalledExactlyOnceWith('variant');
});
it('locks a receipt while keeping only its acknowledgement action and discard available', async () => {
  await act(async () => root.render(<Proposal receiptMode="replace" />));
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(button('textRewriteVariant').disabled).toBe(true);
  expect(button('textRewriteReplace').disabled).toBe(false);
  await act(async () => button('textRewriteReplace').click());
  expect(apply).toHaveBeenCalledExactlyOnceWith('replace');
  await act(async () => button('recognitionDiscard').click());
  expect(discard).toHaveBeenCalledOnce();
});
it('pages the proposal and retains accepted and running command locks', async () => {
  await act(async () => root.render(<Proposal pages accepted />));
  expect(host.querySelectorAll('textarea')).toHaveLength(50);
  await act(async () => button('textFragmentMore').click());
  expect(host.querySelectorAll('textarea')).toHaveLength(51);
  expect(button('textRewriteReplace')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toContain('textRewriteApplied');
  await act(async () => root.render(<Proposal running />));
  expect(button('recognitionDiscard').disabled).toBe(true);
});
