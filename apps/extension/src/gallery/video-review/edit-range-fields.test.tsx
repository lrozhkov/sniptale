// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewEditRangeFields } from './edit-range-fields';
import type { ReviewEdit } from '../../features/video/review/types';
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));

it('applies completed steps immediately, follows irregular boundaries and skips unchanged edges', async () => {
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
  const apply = vi.fn().mockResolvedValue(true);
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
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith({ kind: 'range', start: 5.1, end: 8 });
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.rangeStart"]')!.value
    ).toBe('5.1');
    expect(host.querySelector('[aria-label="gallery.videoReview.applyRange"]')).toBeNull();
    expect(host.querySelector('[aria-label="common.actions.cancel"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('blocks duplicate commits while saving and restores a rejected edge for retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const edit: ReviewEdit = {
    id: 'cut',
    kind: 'cut',
    start: 1,
    end: 8,
    requestedStart: 1,
    requestedEnd: 8,
  };
  let resolve!: (saved: boolean) => void;
  const apply = vi.fn(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
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
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="gallery.videoReview.rangeStart"]'
    )!;
    await act(async () => step.click());
    expect(input.disabled).toBe(true);
    await act(async () => step.click());
    expect(apply).toHaveBeenCalledOnce();
    await act(async () => resolve(false));
    expect(input.value).toBe('1');
    expect(input.disabled).toBe(false);
    await act(async () => step.click());
    await act(async () => resolve(true));
    expect(input.value).toBe('2.3');
    expect(apply).toHaveBeenCalledTimes(2);
    await act(async () =>
      root.render(
        <ReviewEditRangeFields
          edit={{ ...edit }}
          edits={[edit]}
          duration={10}
          boundaries={[0, 1, 2.3, 5.1, 8, 10]}
          onApply={apply}
        />
      )
    );
    expect(input.value).toBe('1');
    expect(apply).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
