// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewEditRangeFields } from './edit-range-fields';
import type { ReviewEdit } from '../../features/video/review/types';
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));

it('keeps repeated edge steps local, follows irregular boundaries and applies once', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const edit: ReviewEdit = {
    id: 's',
    kind: 'speed',
    rate: 2,
    audio: 'speed',
    start: 1,
    end: 8,
    requestedStart: 1,
    requestedEnd: 8,
  };
  const apply = vi.fn().mockResolvedValue(undefined);
  try {
    await act(async () =>
      root.render(
        <ReviewEditRangeFields
          edit={edit}
          edits={[edit]}
          duration={10}
          boundaries={[0, 1, 2.3, 5.1, 8, 10]}
          onApply={apply}
        />
      )
    );
    const step = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.rangeStart increase"]'
    )!;
    await act(async () => step.click());
    await act(async () => step.click());
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.rangeStart"]')!.value
    ).toBe('5.1');
    await act(async () => step.click());
    expect(apply).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.rangeStart"]')!.value
    ).toBe('5.1');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.applyRange"]')!
        .click()
    );
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: 'range', start: 5.1, end: 8 });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="common.actions.cancel"]')!.click()
    );
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.rangeStart"]')!.value
    ).toBe('1');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
