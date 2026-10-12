// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewActionHistory } from './action-history';
import { ReviewClickOverlay } from './click-animation-overlay';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import { reviewActionAudioRefKey } from '../../features/video/review/advanced/action-audio';

it('selects point-free clicks and typing independently when their opaque IDs match', async () => {
  const { queryHistory } = await import('./action-history-filters');
  const markers = [
    { ref: { kind: 'action' as const, id: 'same' }, eventType: 'CLICK', start: 1, end: 1 },
    { ref: { kind: 'signal' as const, id: 'same' }, eventType: 'typing', start: 2, end: 5 },
    { ref: { kind: 'signal' as const, id: 'idle' }, eventType: 'cursor-idle', start: 2, end: 5 },
  ];
  const selected = [reviewActionAudioRefKey({ kind: 'signal', id: 'same' })];
  const filters = { query: '', type: 'all', targetType: 'all', status: 'all', longer: 0 };
  const result = queryHistory(markers, new Map(), filters, selected, new Map());
  expect(result.ids).toEqual(selected);
  expect(result.matching).toEqual(
    new Set([reviewActionAudioRefKey({ kind: 'action', id: 'same' }), ...selected])
  );
  expect(result.checked).toBe(1);
  expect(
    queryHistory(
      markers,
      new Map(),
      { ...filters, type: 'typing', status: 'selected' },
      selected,
      new Map()
    ).filtered
  ).toEqual([markers[1]]);
});

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

// Exercise presentation field contracts; real shared controls are covered by the browser flow.
vi.mock('../../ui/compact-inspector-controls', () => ({
  SearchField: (p: { label: string; value: string; onChange(value: string): void }) => (
    <input aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
  SelectField: (p: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      <option value="" />
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  NumericRow: (p: {
    label: string;
    value: number | null;
    onPreviewValue(value: number): void;
    onCommitValue(value: number): void;
  }) => (
    <input
      type="number"
      aria-label={p.label}
      value={p.value ?? ''}
      onChange={(e) => {
        p.onPreviewValue(Number(e.target.value));
        p.onCommitValue(Number(e.target.value));
      }}
    />
  ),
  ColorField: (p: { label: string; value: string; onChange(value: string): void }) => (
    <input aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));

it('keeps batch edits explicit across filters, mixed fields and event navigation', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const markers = Array.from({ length: 55 }, (_, i) => ({
    ref: { kind: 'action' as const, id: `c${i}` },
    eventType: 'CLICK',
    start: i,
    end: i,
    target: `Target ${i}`,
    focusPoint: { x: 0.5, y: 0.5 },
  }));
  const render = (animated = false, busy = false) =>
    act(() =>
      root.render(
        <ReviewActionHistory
          markers={[
            ...markers,
            { ref: { kind: 'action', id: 'unlocated' }, eventType: 'CLICK', start: 55, end: 55 },
            { ref: { kind: 'signal', id: 'idle' }, eventType: 'static-frame', start: 56, end: 58 },
            {
              ref: { kind: 'signal', id: 'typing' },
              eventType: 'typing',
              target: 'Search field',
              start: 60,
              end: 66,
            },
          ]}
          animations={
            animated
              ? [{ ...REVIEW_CLICK_DEFAULT, id: 'c0', effect: 'ripple', color: '#ff0000ff' }]
              : []
          }
          busy={busy}
          onChange={onChange}
          onSelect={onSelect}
        />
      )
    );
  const click = (key: string) =>
    act(() =>
      host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!.click()
    );
  const change = (key: string, value: string) =>
    act(() => {
      const node = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[aria-label="gallery.videoReview.${key}"]`
      )!;
      const proto =
        node instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(node, value);
      node.dispatchEvent(
        new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
      );
    });
  try {
    render();
    expect(host.querySelectorAll('li')).toHaveLength(50);
    click('historyMore');
    expect(host.querySelectorAll('li')).toHaveLength(58);
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.historyConfigure"]')
        ?.disabled
    ).toBe(true);
    act(() => host.querySelector<HTMLInputElement>('li input[type="checkbox"]')!.click());
    change('historySearch', 'Target 1');
    click('historySelectAll');
    expect(host.textContent).toContain('gallery.videoReview.historyHiddenSelected');
    click('historySelectAll');
    click('historyConfigure');
    change('clickEffect', 'ripple');
    expect(onChange).toHaveBeenLastCalledWith(['c0'], { effect: 'ripple' });
    click('historyBack');
    click('historySearchClear');
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.historySelectAll"]')!
        .indeterminate
    ).toBe(true);
    change('historyStatus', 'selected');
    expect(host.querySelectorAll('li')).toHaveLength(1);
    change('historyStatus', 'all');
    click('historyClear');
    render(false, true);
    click('historySelectAll');
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.historySelectAll"]')!
        .checked
    ).toBe(false);
    render();
    click('historyMore');
    click('historySelectAll');
    expect(host.querySelector('[data-ui="gallery.videoReview.clickFields"]')).toBeNull();
    click('historyConfigure');
    expect(host.querySelector('ol')).toBeNull();
    change('clickEffect', 'ripple');
    expect(onChange).toHaveBeenLastCalledWith(
      markers.map((m) => m.ref.id),
      { effect: 'ripple' }
    );
    render(true);
    expect(host.textContent).toContain('gallery.videoReview.clickMixed');
    change('clickBefore', '50');
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), { before: 0.05 });
    change('clickX', '10');
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), { x: 0.1 });
    change('clickEasing', 'linear');
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), { easing: 'linear' });
    change('clickColor', '#00ff00');
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), { color: '#00ff00', opacity: 1 });
    click('clickReset');
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), null);
    click('historyBack');
    expect(host.querySelectorAll('li')).toHaveLength(58);
    click('historyClear');
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    change('historyStatus', 'animated');
    expect(host.querySelectorAll('li')).toHaveLength(1);
    act(() => host.querySelector<HTMLButtonElement>('li button')!.click());
    expect(onSelect).toHaveBeenCalledWith(markers[0]);
    change('historyStatus', 'all');
    change('historyType', 'clicks');
    expect(host.querySelectorAll('li')).toHaveLength(50);
    change('historySearch', 'not found');
    expect(host.textContent).toContain('gallery.videoReview.historyEmpty');
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.historySelectAll"]')!
        .disabled
    ).toBe(true);
    click('historySearchClear');
    change('historyType', 'static-frame');
    expect(host.querySelectorAll('li')).toHaveLength(1);
    change('historyLonger', '2');
    expect(host.querySelectorAll('li')).toHaveLength(0);
    change('historyType', 'typing');
    change('historyLonger', '5');
    expect(host.querySelectorAll('li')).toHaveLength(1);
    expect(host.querySelector('li')!.textContent).toContain('Search field');
    expect(host.querySelector('li input[type="checkbox"]')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('li button')!.click());
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'typing' }));
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('paints only active click cues and removes the live canvas outside their lifetime', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
  };
  const get = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const host = document.createElement('div');
  const root = createRoot(host);
  const rect = { x: 0, y: 0, width: 640, height: 360 };
  const cues = [
    {
      settings: { ...REVIEW_CLICK_DEFAULT, effect: 'ripple' as const },
      point: { x: 0.5, y: 0.5 },
      anchor: 1,
      start: 1,
      end: 1.6,
    },
  ];
  try {
    act(() =>
      root.render(
        <ReviewClickOverlay
          cues={cues}
          time={1.1}
          output={rect}
          video={rect}
          sourceWidth={640}
          clip={{ rect, radius: 0 }}
        />
      )
    );
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(host.querySelector('canvas')).not.toBeNull();
    act(() =>
      root.render(
        <ReviewClickOverlay
          time={2}
          output={rect}
          video={undefined}
          sourceWidth={640}
          clip={undefined}
        />
      )
    );
    expect(host.querySelector('canvas')).toBeNull();
  } finally {
    act(() => root.unmount());
    get.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('keeps legacy transparency visible in the color field and removes its multiplier on color edit', async () => {
  const { ReviewClickFields } = await import('./click-animation-fields');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const change = vi.fn();
  try {
    act(() =>
      root.render(
        <ReviewClickFields
          values={[{ ...REVIEW_CLICK_DEFAULT, effect: 'ripple', color: '#ff000080', opacity: 0.5 }]}
          onChange={change}
        />
      )
    );
    const color = host.querySelector<HTMLInputElement>(
      '[aria-label="gallery.videoReview.clickColor"]'
    )!;
    expect(color.value).toBe('#ff000040');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        color,
        '#00ff0080'
      );
      color.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(change).toHaveBeenCalledExactlyOnceWith({ color: '#00ff0080', opacity: 1 });
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('refreshes a paused lens when its target frame finishes decoding without a React update', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
  };
  const get = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const source = document.createElement('video');
  let readyState = 1;
  Object.defineProperty(source, 'readyState', { get: () => readyState });
  const host = document.createElement('div');
  const root = createRoot(host);
  const rect = { x: 0, y: 0, width: 640, height: 360 };
  try {
    act(() =>
      root.render(
        <ReviewClickOverlay
          cues={[
            {
              settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify' },
              point: { x: 0.5, y: 0.5 },
              anchor: 1,
              start: 0.5,
              end: 1.6,
            },
          ]}
          time={1}
          output={rect}
          video={rect}
          sourceWidth={640}
          clip={{ rect, radius: 0 }}
          getFrame={() => source}
        />
      )
    );
    expect(context.drawImage).not.toHaveBeenCalled();
    readyState = 2;
    act(() => source.dispatchEvent(new Event('loadeddata')));
    expect(context.drawImage).toHaveBeenCalledOnce();
    act(() => source.dispatchEvent(new Event('seeked')));
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
    source.dispatchEvent(new Event('seeked'));
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  } finally {
    get.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('configures recorded keys without pointer locations, separately from selected clicks', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  const onChange = vi.fn(),
    onKeyChange = vi.fn();
  try {
    act(() =>
      root.render(
        <ReviewActionHistory
          markers={[
            {
              ref: { kind: 'action', id: 'key' },
              eventType: 'KEY',
              target: 'Ctrl+C',
              start: 1,
              end: 1.55,
            },
            {
              ref: { kind: 'action', id: 'click' },
              eventType: 'CLICK',
              start: 2,
              end: 2,
              focusPoint: { x: 0.5, y: 0.5 },
            },
          ]}
          animations={[]}
          busy={false}
          onChange={onChange}
          onKeyChange={onKeyChange}
          onSelect={() => undefined}
        />
      )
    );
    expect(host.querySelectorAll('li input')).toHaveLength(2);
    act(() =>
      host
        .querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.historySelectAll"]')!
        .click()
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.historyConfigure"]')!
        .click()
    );
    expect(host.querySelector('[data-ui="gallery.videoReview.clickFields"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-ui="gallery.videoReview.inspectorSections"]')).toHaveLength(
      1
    );
    expect(host.textContent).toContain('gallery.videoReview.historyClicks');
    expect(host.textContent).toContain('gallery.videoReview.historyKeys');
    const select = host.querySelector<HTMLSelectElement>(
      '[aria-label="gallery.videoReview.keyDisplay"]'
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
        select,
        'on'
      );
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onKeyChange).toHaveBeenCalledExactlyOnceWith(['key'], { enabled: true });
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('filters click targets without hiding recovery controls on an empty result', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <ReviewActionHistory
        markers={[
          {
            ref: { kind: 'action', id: 'button' },
            eventType: 'CLICK',
            start: 1,
            end: 1,
            target: 'Save',
            targetSemantics: { kind: 'button', source: 'html' },
          },
          {
            ref: { kind: 'action', id: 'input' },
            eventType: 'CLICK',
            start: 2,
            end: 2,
            target: 'Name',
            targetSemantics: { kind: 'text-field', source: 'html' },
          },
          { ref: { kind: 'signal', id: 'typing' }, eventType: 'typing', start: 3, end: 5 },
        ]}
        animations={[]}
        busy={false}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    )
  );
  const change = (key: string, value: string) =>
    act(() => {
      const select = host.querySelector<HTMLSelectElement>(
        `[aria-label="gallery.videoReview.${key}"]`
      )!;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  try {
    change('targetType', 'button');
    expect(host.querySelectorAll('li')).toHaveLength(1);
    expect(host.querySelector('li')?.textContent).toContain('Save');
    expect(host.querySelector('[aria-label="gallery.videoReview.historyLonger"]')).toBeNull();
    const elements = host.querySelector<HTMLSelectElement>(
      '[aria-label="gallery.videoReview.historyElement"]'
    )!;
    expect(Array.from(elements.options, (option) => option.value).filter(Boolean)).toEqual([
      'Save',
    ]);
    change('historyElement', 'Save');
    change('targetType', 'text-field');
    expect(elements.value).toBe('');
    expect(Array.from(elements.options, (option) => option.value).filter(Boolean)).toEqual([
      'Name',
    ]);
    expect(host.querySelector('li')?.textContent).toContain('Name');
    change('targetType', 'button');
    change('historyStatus', 'animated');
    expect(host.querySelectorAll('li')).toHaveLength(0);
    expect(host.querySelector('[aria-label="gallery.videoReview.targetType"]')).not.toBeNull();
    change('historyStatus', 'all');
    change('targetType', 'all');
    expect(host.querySelectorAll('li')).toHaveLength(3);
  } finally {
    act(() => root.unmount());
  }
});

it('ignores incompatible retained filters when displaying interval and keyboard event types', async () => {
  const { queryHistory } = await import('./action-history-filters');
  const markers = [
    { ref: { kind: 'signal' as const, id: 'idle' }, eventType: 'cursor-idle', start: 1, end: 4 },
    {
      ref: { kind: 'action' as const, id: 'key' },
      eventType: 'KEY',
      target: 'Ctrl+C',
      start: 5,
      end: 5,
    },
  ];
  const retained = {
    query: '',
    type: 'cursor-idle',
    targetType: 'button' as const,
    status: 'animated' as const,
    longer: 0,
  };
  expect(
    queryHistory(markers, new Map(), retained, [], new Map()).filtered.map((m) => m.ref.id)
  ).toEqual(['idle']);
  expect(
    queryHistory(
      markers,
      new Map(),
      { ...retained, type: 'KEY', status: 'all', longer: 2 },
      [],
      new Map()
    ).filtered.map((m) => m.ref.id)
  ).toEqual(['key']);
});

it('filters concrete targets and clears only incompatible dependent criteria', async () => {
  const { queryHistory } = await import('./action-history-filters');
  const click = (id: string, target: string, kind: 'button' | 'text-field') => ({
    ref: { kind: 'action' as const, id },
    eventType: 'CLICK',
    start: 1,
    end: 1,
    target,
    targetSemantics: { kind, source: 'html' as const },
    focusPoint: { x: 0.5, y: 0.5 },
  });
  const markers = [
    click('save', 'Save', 'button'),
    click('export', 'Export', 'button'),
    click('input', 'Save', 'text-field'),
    click('all', 'all', 'button'),
    { ref: { kind: 'signal' as const, id: 'idle' }, eventType: 'static-frame', start: 2, end: 6 },
  ];
  const filters = {
    query: '',
    type: 'all',
    targetType: 'button',
    element: 'Save',
    status: 'all',
    longer: 5,
  };
  const query = (patch: Partial<typeof filters> = {}) =>
    queryHistory(markers, new Map(), { ...filters, ...patch }, [], new Map());
  expect(query().filtered.map((m) => m.ref.id)).toEqual(['save']);
  expect(query().elementMarkers.map((m) => m.ref.id)).toEqual(['save', 'export', 'all']);
  expect(query({ element: 'all' }).filtered.map((m) => m.ref.id)).toEqual(['all']);
  expect(
    query({ targetType: 'text-field', element: 'Export' }).filtered.map((m) => m.ref.id)
  ).toEqual(['input']);
  expect(query({ type: 'static-frame', longer: 2 }).filtered.map((m) => m.ref.id)).toEqual([
    'idle',
  ]);
  expect(query({ query: 'Export' }).filtered).toEqual([]);
  expect(query({ query: 'Export' }).elementMarkers.map((m) => m.ref.id)).toEqual(['export']);
  expect(query({ status: 'animated' }).elementMarkers).toEqual([]);
});

it('keeps the inspected action distinct from batch selection on return', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const ref = { kind: 'action' as const, id: 'current' };
  const markers = [
    { ref, eventType: 'CLICK', start: 1, end: 1, target: 'Save', focusPoint: { x: 0.5, y: 0.5 } },
    {
      ref: { kind: 'signal' as const, id: 'current' },
      eventType: 'static-frame',
      start: 2,
      end: 4,
    },
  ];
  try {
    act(() =>
      root.render(
        <ReviewActionHistory
          markers={markers}
          activeRef={ref}
          animations={[]}
          busy={false}
          onSelect={vi.fn()}
          onChange={vi.fn()}
        />
      )
    );
    expect(host.querySelectorAll('li[data-active]')).toHaveLength(1);
    expect(host.querySelector('li[data-active] .review-history-target')?.textContent).toBe('Save');
    expect(host.querySelector('li[data-active] input')?.getAttribute('checked')).toBeNull();
    act(() => host.querySelector<HTMLInputElement>('li input')!.click());
    expect(host.querySelectorAll('li[data-active]')).toHaveLength(1);
    expect(host.querySelector('li[data-active]')?.getAttribute('data-selected')).toBe('true');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
