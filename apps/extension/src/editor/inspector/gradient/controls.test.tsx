// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  NumericRow: (props: {
    label: string;
    onCommitValue: (value: number) => void;
    unit?: string;
    value: number;
  }) => (
    <button
      type="button"
      data-testid={`numeric-${props.label}`}
      data-value={String(props.value)}
      data-unit={props.unit ?? ''}
      onClick={() => props.onCommitValue(40)}
    />
  ),
  ColorField: (props: { title: string; onChange: (color: string) => void }) => (
    <button type="button" onClick={() => props.onChange('#abcdef')}>
      {props.title}
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { EditorGradientControls } from './controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
}

function clickGradientControl(selector: string) {
  act(() => {
    (container?.querySelector(selector) as HTMLButtonElement).click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('moves the selected gradient stop directly on the gradient track', () => {
  const onStopsChange = vi.fn();

  render(
    <EditorGradientControls
      angle={0}
      showAngle={false}
      stops={[
        { color: '#111111', offset: 0 },
        { color: '#222222', offset: 1 },
      ]}
      onAngleChange={vi.fn()}
      onStopsChange={onStopsChange}
    />
  );

  const track = container?.querySelector<HTMLElement>('[role="slider"]');
  if (!track) {
    throw new Error('gradient track is missing');
  }
  track.getBoundingClientRect = () =>
    ({
      bottom: 0,
      height: 24,
      left: 50,
      right: 150,
      top: 0,
      width: 100,
      x: 50,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  act(() => {
    track?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 75 }));
  });

  expect(onStopsChange).toHaveBeenCalledWith([
    { color: '#111111', offset: 0.25 },
    { color: '#222222', offset: 1 },
  ]);
});

it('uses selected-stop opacity instead of a separate position range', () => {
  const onStopsChange = vi.fn();

  render(
    <EditorGradientControls
      angle={0}
      showAngle={false}
      stops={[
        { color: '#111111', offset: 0, opacity: 0.75 },
        { color: '#222222', offset: 1 },
      ]}
      onAngleChange={vi.fn()}
      onStopsChange={onStopsChange}
    />
  );

  expect(container?.querySelector('[data-testid="numeric-editor.gradient.position"]')).toBeNull();
  expect(
    container
      ?.querySelector('[data-testid="numeric-editor.gradient.opacity"]')
      ?.getAttribute('data-value')
  ).toBe('75');
  expect(
    container
      ?.querySelector('[data-testid="numeric-editor.gradient.opacity"]')
      ?.getAttribute('data-unit')
  ).toBe('%');

  act(() => {
    (
      container?.querySelector(
        '[data-testid="numeric-editor.gradient.opacity"]'
      ) as HTMLButtonElement | null
    )?.click();
  });

  expect(onStopsChange).toHaveBeenCalledWith([
    { color: '#111111', offset: 0, opacity: 0.4 },
    { color: '#222222', offset: 1 },
  ]);
});

it('adds stops and delegates opacity and angle commits through optional handlers', () => {
  const onAngleChange = vi.fn();
  const onAngleCommit = vi.fn();
  const onStopOpacityChange = vi.fn();
  const onStopsChange = vi.fn();

  render(
    <EditorGradientControls
      angle={15}
      palette={['#111111']}
      recentColors={['#222222']}
      stops={[
        { color: '#111111', offset: 0 },
        { color: '#222222', offset: 1 },
      ]}
      onAngleChange={onAngleChange}
      onAngleCommit={onAngleCommit}
      onStopOpacityChange={onStopOpacityChange}
      onStopsChange={onStopsChange}
    />
  );

  clickGradientControl('[aria-label="editor.gradient.addStop"]');
  clickGradientControl('[data-testid="numeric-editor.gradient.opacity"]');
  clickGradientControl('[data-testid="numeric-editor.gradient.angle"]');

  expect(onStopsChange).toHaveBeenCalledWith([
    { color: '#111111', offset: 0 },
    { color: '#111111', offset: 0.5 },
    { color: '#222222', offset: 1 },
  ]);
  expect(onStopOpacityChange).toHaveBeenCalledWith({
    opacity: 0.4,
    selectedIndex: 1,
    stop: { color: '#222222', offset: 1 },
  });
  expect(onAngleChange).toHaveBeenCalledWith(40);
  expect(onAngleCommit).toHaveBeenCalledOnce();
});
