// @vitest-environment jsdom
import { act, memo, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Clock3 } from 'lucide-react';
import { ReviewActionHistory } from './action-history';
import { ReviewInspectorPresentation, ReviewInspectorSections } from './inspector-sections';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';

const categoryRenders = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/ui/categorized-inspector', async (load) => {
  const original = await load<typeof import('@sniptale/ui/categorized-inspector')>();
  return {
    ...original,
    CategorizedInspector: (props: ComponentProps<typeof original.CategorizedInspector>) => {
      categoryRenders();
      return <original.CategorizedInspector {...props} />;
    },
  };
});
const filterRenders = vi.hoisted(() => vi.fn());
vi.mock('./action-history-filters', async (load) => {
  const original = await load<typeof import('./action-history-filters')>();
  return {
    ...original,
    HistoryFilters: (props: ComponentProps<typeof original.HistoryFilters>) => {
      filterRenders();
      return <original.HistoryFilters {...props} />;
    },
  };
});

it('skips equal history inputs without losing local selection and updates real values', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  const marker: ReviewTelemetryMarker = {
    ref: { kind: 'action', id: 'kept' },
    eventType: 'CLICK',
    start: 1,
    end: 1,
    target: 'Save',
  };
  const props: ComponentProps<typeof ReviewActionHistory> = {
    markers: [marker],
    animations: [],
    busy: false,
    onSelect: vi.fn(),
    onChange: vi.fn(),
  };
  const render = (patch: Partial<typeof props> = {}) =>
    act(() => root.render(<ReviewActionHistory {...props} {...patch} />));
  try {
    render();
    const input = host.querySelector<HTMLInputElement>('li input')!;
    act(() => input.click());
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'a');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const list = host.querySelector('.review-history-results')!;
    list.scrollTop = 37;
    search.focus();
    const initial = filterRenders.mock.calls.length;
    render();
    render();
    expect(filterRenders).toHaveBeenCalledTimes(initial);
    expect(host.querySelector('li input')).toBe(input);
    expect(input.checked).toBe(true);
    expect(host.querySelector('input[type="search"]')).toBe(search);
    expect(search.value).toBe('a');
    expect(document.activeElement).toBe(search);
    expect(list.scrollTop).toBe(37);
    for (const patch of [
      { animations: [{ ...REVIEW_CLICK_DEFAULT, id: 'kept', effect: 'off' as const }] },
      { keyAnimations: [{ ...REVIEW_KEY_DEFAULT, id: 'key' }] },
      { actionAudio: [] },
    ]) {
      const before = filterRenders.mock.calls.length;
      render(patch);
      expect(filterRenders.mock.calls.length).toBeGreaterThan(before);
    }
    render({ activeRef: marker.ref });
    expect(host.querySelector('li[data-active]')).not.toBeNull();
    render({ busy: true });
    expect(host.querySelector('fieldset')!.disabled).toBe(true);
    render({
      markers: [{ ...marker, target: 'Updated' }],
      captureCapabilities: {
        version: 1,
        pointer: 'unavailable',
        keyboard: 'available',
        wheel: 'unavailable',
        coverage: 'document',
      },
    });
    expect(host.textContent).toContain('Updated');
    expect(filterRenders.mock.calls.length).toBeGreaterThan(initial);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('preserves equal presentation context and propagates actual presentation family choices', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  const Sections = memo(ReviewInspectorSections);
  const child = (
    <Sections
      sections={[
        { id: 'one', label: 'One', icon: Clock3, content: <span>First content</span> },
        { id: 'two', label: 'Two', icon: Clock3, content: <span>Second content</span> },
      ]}
    />
  );
  const render = (section: 'history' | 'scene', value: 'all' | 'sections' = 'sections') =>
    act(() =>
      root.render(
        <ReviewInspectorPresentation section={section} value={value}>
          {child}
        </ReviewInspectorPresentation>
      )
    );
  try {
    render('history');
    const initial = categoryRenders.mock.calls.length;
    expect(initial).toBeGreaterThan(0);
    render('history');
    render('history');
    expect(categoryRenders).toHaveBeenCalledTimes(initial);
    render('scene');
    expect(categoryRenders.mock.calls.length).toBeGreaterThan(initial);
    render('scene', 'all');
    expect(host.querySelector('[data-presentation="all"]')).not.toBeNull();
    expect(host.textContent).toContain('First content');
    expect(host.textContent).toContain('Second content');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('refreshes the memoized history filters on a real locale notification', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { getCurrentLocale, setLocalePreference } = await import('../../platform/i18n');
  const locale = getCurrentLocale();
  const host = document.createElement('div'),
    root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ReviewActionHistory
          markers={[]}
          animations={[]}
          busy={false}
          onSelect={vi.fn()}
          onChange={vi.fn()}
        />
      )
    );
    const initial = filterRenders.mock.calls.length;
    await act(async () => setLocalePreference(locale === 'en' ? 'ru' : 'en'));
    expect(filterRenders.mock.calls.length).toBeGreaterThan(initial);
  } finally {
    await act(async () => root.unmount());
    await setLocalePreference(locale);
    vi.unstubAllGlobals();
  }
});
