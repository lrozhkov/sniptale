// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { reviewClickSections } from './click-animation-fields';
import { reviewKeySections } from './key-animation-fields';
import { reviewActionAudioSection } from './action-audio-fields';
import { ReviewActionProperties } from './action-properties';
import { planReviewActionEdits } from '../../features/video/review/action-edits';
import { translate } from '../../platform/i18n';

const marker = {
  ref: { kind: 'action' as const, id: 'click' },
  eventType: 'CLICK',
  start: 1,
  end: 1,
  target: '<button>Save</button>',
};
const plan = planReviewActionEdits({
  marker,
  duration: 6,
  edits: [],
  regions: [],
  boundaries: [0, 2, 4, 6],
  snapToKeyframes: false,
});

it('offers press feedback rather than a fabricated click ripple for an incomplete observed prefix', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
          marker={{
            ...marker,
            focusPoint: { x: 0.1, y: 0.2 },
            gesture: { id: 'click', type: 'click', button: 0, downTime: 1, completion: 'lost' },
          }}
          plan={plan}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
        />
      )
    );
    const control = host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.clickEffect')}"]`
    )!;
    act(() => control.click());
    expect(
      Array.from(document.querySelectorAll('[role="option"]'), (option) => option.textContent)
    ).toEqual([
      translate('gallery.videoReview.click_off'),
      translate('gallery.videoReview.click_press'),
    ]);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('shows recorded target metadata as text and tolerates a disappearing selection', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
          plan={plan}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
          marker={{
            ref: { kind: 'action', id: 'click' },
            eventType: 'CLICK',
            start: 1,
            end: 1,
            target: '<button>Save</button>',
          }}
        />
      )
    );
    expect(host.textContent).toContain('<button>Save</button>');
    const target = host.querySelector('[title="<button>Save</button>"]')!;
    expect(target.textContent).toBe('<button>Save</button>');
    expect(target.parentElement?.textContent).toContain(
      translate('gallery.videoReview.clickTarget')
    );
    expect(target.parentElement?.nextElementSibling?.textContent).toContain(
      translate('gallery.videoReview.clickRecordedAt')
    );
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.textContent).not.toContain('Focus on action');
    expect(host.querySelectorAll('button:disabled')).toHaveLength(0);
    act(() =>
      root.render(
        <ReviewActionProperties
          marker={undefined}
          plan={null}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
        />
      )
    );
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

vi.mock('./key-animation-fields', async (original) => ({
  ...(await original<typeof import('./key-animation-fields')>()),
  ReviewKeyFields: (props: {
    information?: ReactNode;
    onChange(patch: { enabled: boolean }): void;
  }) => (
    <>
      {props.information}
      <button onClick={() => props.onChange({ enabled: true })}>Enable key caption</button>
    </>
  ),
}));
it('configures keyboard points without offering interval focus edits', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host),
    onKeyAnimation = vi.fn();
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
          marker={{ ...marker, eventType: 'KEY', target: 'Ctrl+C', end: 1.55 }}
          plan={plan}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
          onKeyAnimation={onKeyAnimation}
        />
      )
    );
    expect(host.textContent).toContain('Ctrl+C');
    expect(host.textContent).not.toContain('Focus on action');
    act(() => host.querySelector('button')!.click());
    expect(onKeyAnimation).toHaveBeenCalledExactlyOnceWith(['click'], { enabled: true });
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps interval metadata and editing actions unchanged for non-click events', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const interval = { ...marker, eventType: 'SCROLL', end: 3 };
  const onEdit = vi.fn();
  const onFocus = vi.fn();
  const intervalPlan = planReviewActionEdits({
    marker: interval,
    duration: 6,
    edits: [],
    regions: [],
    boundaries: [0, 2, 4, 6],
    snapToKeyframes: false,
  });
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
          marker={interval}
          plan={intervalPlan}
          busy={false}
          onEdit={onEdit}
          onFocus={onFocus}
        />
      )
    );
    expect(host.textContent).not.toContain(translate('gallery.videoReview.clickTarget'));
    expect(host.querySelector(`dd[title="${interval.target}"]`)?.textContent).toBe(interval.target);
    for (const key of ['actionCut', 'actionSpeed', 'actionFocus'] as const) {
      const button = host.querySelector<HTMLButtonElement>(
        `[aria-label="${translate(`gallery.videoReview.${key}`)}"]`
      )!;
      expect(button.disabled).toBe(false);
      act(() => button.click());
    }
    expect(onEdit.mock.calls).toEqual([['cut'], ['speed']]);
    expect(onFocus).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('presents immutable recorded facts in an information section before animation controls', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
          marker={marker}
          plan={plan}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
        />
      )
    );
    const information = host.querySelector('[data-section="information"]');
    expect(information).not.toBeNull();
    expect(information!.querySelector('dl')?.textContent).toContain(marker.target);
    expect(information!.querySelector(`dd[title="${marker.target}"]`)?.textContent).toBe(
      marker.target
    );
    expect(information!.querySelectorAll('input,select,textarea')).toHaveLength(0);
    expect(host.querySelector('[data-section]')?.getAttribute('data-section')).toBe('information');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each([
  [
    'click',
    () =>
      reviewClickSections({
        values: [],
        onChange: vi.fn(),
        extraSections: [reviewActionAudioSection(null)],
      }),
  ],
  [
    'key',
    () =>
      reviewKeySections({
        values: [],
        onChange: vi.fn(),
        extraSections: [reviewActionAudioSection(null)],
      }),
  ],
] as const)('places %s commands after the sound settings', (_, sections) => {
  expect(
    sections()
      .map((section) => section.id)
      .slice(-2)
  ).toEqual(['action-audio', 'actions']);
});
