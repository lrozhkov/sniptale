// @vitest-environment jsdom

import { act, useRef, useState, type MutableRefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clonePaint, createGradientPaint, serializePaintToCss } from '@sniptale/foundation/paint';
import { usePaintHistory } from './history';
import { usePaintModeState, type PaintModeDrafts } from './mode-state';
import { CompactPaintSelector } from '.';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let nextId = 0;
const createId = () => `history-stop-${++nextId}`;
const initial = createGradientPaint('#ff0000', createId, 'linear');
if (initial.kind !== 'gradient') throw new Error('Expected a gradient fixture');
initial.gradient.stops[1]!.color = '#0000ffff';
const firstId = initial.gradient.stops[0]!.id;
const lastId = initial.gradient.stops[1]!.id;

function Editor(props: { open: boolean; cache?: MutableRefObject<PaintModeDrafts> }) {
  const [draft, preview] = useState(() => clonePaint(initial));
  const [selected, select] = useState<string | null>(firstId);
  const ownCache = useRef<PaintModeDrafts>({});
  const cache = props.cache ?? ownCache;
  const history = usePaintHistory({
    modeDrafts: cache,
    draft,
    open: props.open,
    selected,
    preview,
    select,
  });
  const mode = usePaintModeState({
    createId,
    draft,
    externalValue: initial,
    open: props.open,
    modeDrafts: cache,
    preview: history.preview,
    selectStop: select,
  });
  return (
    <>
      <output data-result="preview">{serializePaintToCss(draft)}</output>
      <output data-result="mode">{draft.kind === 'solid' ? 'solid' : draft.gradient.type}</output>
      <output data-result="selected">{selected}</output>
      {draft.kind === 'gradient'
        ? draft.gradient.stops.map((stop) => (
            <button
              key={stop.id}
              aria-label={stop.id}
              aria-pressed={stop.id === selected}
              onClick={() => select(stop.id)}
            >
              {stop.id}
            </button>
          ))
        : null}
      {draft.kind === 'gradient' && draft.gradient.type === 'linear' ? (
        <input
          aria-label="Angle"
          type="range"
          min={0}
          max={359}
          value={draft.gradient.angle}
          onPointerDown={history.begin}
          onPointerUp={history.end}
          onPointerCancel={history.end}
          onChange={(event) => {
            if (draft.kind === 'gradient' && draft.gradient.type === 'linear')
              history.preview({
                kind: 'gradient',
                gradient: { ...draft.gradient, angle: Number(event.target.value) },
              });
          }}
        />
      ) : null}
      {draft.kind === 'gradient' && draft.gradient.type === 'radial' ? (
        <input
          aria-label="Radius X"
          type="number"
          value={draft.gradient.radius.x}
          onFocus={history.begin}
          onBlur={history.end}
          onChange={(event) => {
            if (draft.kind === 'gradient' && draft.gradient.type === 'radial')
              history.preview({
                kind: 'gradient',
                gradient: {
                  ...draft.gradient,
                  radius: { ...draft.gradient.radius, x: Number(event.target.value) },
                },
              });
          }}
        />
      ) : null}
      <button aria-label="Undo" disabled={!history.canUndo} onClick={history.undo}>
        Undo
      </button>
      <button aria-label="Redo" disabled={!history.canRedo} onClick={history.redo}>
        Redo
      </button>
      <button aria-label="Linear" onClick={() => mode('linear')}>
        Linear
      </button>
      <button aria-label="Radial" onClick={() => mode('radial')}>
        Radial
      </button>
      <button aria-label="Solid" onClick={() => mode('solid')}>
        Solid
      </button>
      <button aria-label="Same preview" onClick={() => history.preview(clonePaint(draft))}>
        Same preview
      </button>
    </>
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it('records each accelerated keyboard stepper hold as one undo action in the shared popup', () => {
  vi.useFakeTimers();
  act(() =>
    root.render(
      <CompactPaintSelector label="Fill" title="Fill" value={initial} onChange={vi.fn()} />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  act(() => vi.advanceTimersByTime(32));
  const popup = document.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.popup"]')!;
  const input = popup.querySelector<HTMLInputElement>(
    'input[aria-label="highlighter.paintPicker.angle"]'
  )!;
  const up = input.closest('.sniptale-picker-number')!.querySelector('button')!;
  const undo = popup.querySelector<HTMLButtonElement>(
    'button[aria-label="highlighter.paintPicker.undo"]'
  )!;
  const hold = (key: string) => {
    act(() => up.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    act(() => vi.advanceTimersByTime(1000));
    act(() => up.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })));
    act(() => vi.advanceTimersByTime(0));
  };
  act(() => up.focus());
  hold('Enter');
  const first = input.value;
  expect(Number(first)).toBeGreaterThan(91);
  hold(' ');
  expect(Number(input.value)).toBeGreaterThan(Number(first));
  act(() => undo.click());
  expect(input.value).toBe(first);
  act(() => undo.click());
  expect(input.value).toBe('90');
  expect(undo.disabled).toBe(true);
});
function render(open = true, cache?: MutableRefObject<PaintModeDrafts>) {
  act(() => root.render(<Editor open={open} {...(cache ? { cache } : {})} />));
}
function button(label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
function click(label: string) {
  act(() => button(label).click());
}
function field(label: string) {
  const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing field ${label}`);
  return node;
}
function enter(label: string, value: string) {
  act(() => {
    const input = field(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function result(name: string) {
  return host.querySelector(`[data-result="${name}"]`)!.textContent;
}
function pointer(type: string) {
  act(() => field('Angle').dispatchEvent(new Event(type, { bubbles: true })));
}

it('undoes a whole pointer gesture once and restores the selected stop on undo and redo', () => {
  render();
  const original = result('preview');
  pointer('pointerdown');
  enter('Angle', '120');
  enter('Angle', '180');
  pointer('pointerup');
  const edited = result('preview');
  expect(edited).not.toBe(original);
  click(lastId);
  click('Undo');
  expect(result('preview')).toBe(original);
  expect(field('Angle').value).toBe('90');
  expect(result('selected')).toBe(firstId);
  expect(button('Undo').disabled).toBe(true);
  click('Redo');
  expect(result('preview')).toBe(edited);
  expect(field('Angle').value).toBe('180');
  expect(result('selected')).toBe(lastId);
  expect(button(lastId).getAttribute('aria-pressed')).toBe('true');
  expect(button('Redo').disabled).toBe(true);
});

it('keeps separate gestures separate and coalesces a focused numeric edit', () => {
  render();
  click('Radial');
  act(() => field('Radius X').focus());
  enter('Radius X', '0.6');
  enter('Radius X', '0.72');
  act(() => field('Radius X').blur());
  expect(field('Radius X').value).toBe('0.72');
  click('Undo');
  expect(field('Radius X').value).toBe('0.5');
  click('Undo');
  expect(result('mode')).toBe('linear');
  expect(button('Undo').disabled).toBe(true);
  click('Redo');
  expect(result('mode')).toBe('radial');
  click('Redo');
  expect(field('Radius X').value).toBe('0.72');
});

it('restores an independent mode-cache snapshot before the cached mode is opened again', () => {
  const cache: MutableRefObject<PaintModeDrafts> = { current: {} };
  render(true, cache);
  click('Radial');
  enter('Radius X', '0.72');
  click('Linear');
  enter('Angle', '137');
  // The cache is an input owned by usePaintModeState; later owner updates must not alter history.
  const cached = cache.current.radial;
  if (!cached || cached.kind !== 'gradient' || cached.gradient.type !== 'radial')
    throw new Error('Expected a radial cache');
  cached.gradient.radius.x = 0.25;
  click('Undo');
  expect(field('Angle').value).toBe('90');
  click('Radial');
  expect(field('Radius X').value).toBe('0.72');
  click('Linear');
  expect(field('Angle').value).toBe('90');
});

it('discards redo after a new edit and ignores selection-only or equal-color previews', () => {
  render();
  click(lastId);
  click('Same preview');
  expect(button('Undo').disabled).toBe(true);
  enter('Angle', '120');
  enter('Angle', '180');
  click('Undo');
  expect(field('Angle').value).toBe('120');
  expect(button('Redo').disabled).toBe(false);
  enter('Angle', '225');
  expect(button('Redo').disabled).toBe(true);
  click('Undo');
  expect(field('Angle').value).toBe('120');
  expect(result('selected')).toBe(lastId);
});

it('starts a fresh history after reopening and releases an unfinished gesture', () => {
  render();
  pointer('pointerdown');
  enter('Angle', '120');
  click('Undo');
  expect(button('Redo').disabled).toBe(false);
  render(false);
  render(true);
  expect(button('Undo').disabled).toBe(true);
  expect(button('Redo').disabled).toBe(true);
  pointer('pointerdown');
  enter('Angle', '180');
  render(false);
  render(true);
  enter('Angle', '225');
  enter('Angle', '270');
  click('Undo');
  expect(field('Angle').value).toBe('225');
  click('Undo');
  expect(field('Angle').value).toBe('180');
});
