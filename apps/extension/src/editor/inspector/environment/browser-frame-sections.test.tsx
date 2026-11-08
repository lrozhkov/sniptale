// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  SelectField: (props: {
    label: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => (
    <button
      type="button"
      data-testid={`select-field-${props.label}`}
      onClick={() =>
        props.onChange(
          props.options.find((option) => option.value !== props.value)?.value ??
            props.options[0]!.value
        )
      }
    >
      {props.options.find((option) => option.value === props.value)?.label ?? props.value}
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('./shared', () => ({
  HeaderValueToggleSection: () => null,
  PanelSection: (props: {
    children?: React.ReactNode;
    label?: React.ReactNode;
    value?: React.ReactNode;
  }) => (
    <section>
      <span>{props.label}</span>
      <span>{props.value}</span>
      {props.children}
    </section>
  ),
  panelButtonClassName: 'panel-button',
}));

import { BrowserFrameBehaviorSections } from './browser-frame-sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it.each([false, true])(
  'routes both composition directions through the async action boundary (fit: %s)',
  async (fit) => {
    const syncBrowserFrame = vi.fn();

    act(() => {
      root?.render(
        <BrowserFrameBehaviorSections
          browserCanvasModeOptions={[
            { label: 'Resize', value: 'resize' },
            { label: 'Keep', value: 'keep-size' },
          ]}
          browserFrame={{
            canvasMode: fit ? 'keep-size' : 'resize',
            contentMode: fit ? 'fit-content' : 'push-down',
          }}
          syncBrowserFrame={syncBrowserFrame}
        />
      );
    });

    await act(async () => {
      container?.querySelectorAll('button').forEach((button) => button.click());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncBrowserFrame).toHaveBeenCalledWith({
      canvasMode: fit ? 'resize' : 'keep-size',
      contentMode: fit ? 'push-down' : 'fit-content',
    });
    expect(container?.querySelectorAll('[data-testid^="select-field-"]')).toHaveLength(1);
  }
);

it('renders alternate labels for keep-size and fit-content browser behavior', () => {
  act(() => {
    root?.render(
      <BrowserFrameBehaviorSections
        browserCanvasModeOptions={[{ label: 'Keep', value: 'keep-size' }]}
        browserFrame={{ canvasMode: 'keep-size', contentMode: 'fit-content' }}
        syncBrowserFrame={vi.fn()}
      />
    );
  });

  expect(container?.textContent).toContain('Keep');
});
