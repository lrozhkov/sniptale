// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderArrowHeadSections } from './heads';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  CompactRange: (props: {
    'aria-label'?: string;
    max?: number;
    min?: number;
    onChange?: (event: { currentTarget: { value: string } }) => void;
    onValueCommit?: () => void;
    value?: number;
  }) => (
    <button
      aria-label={props['aria-label']}
      data-max={props.max}
      data-min={props.min}
      data-value={props.value}
      type="button"
      onClick={() => {
        props.onChange?.({ currentTarget: { value: '7' } });
        props.onValueCommit?.();
      }}
    >
      range
    </button>
  ),
}));

vi.mock('../arrow-head-grid', () => ({
  ArrowHeadPreviewGrid: (props: { ariaLabel: string; value: string }) => (
    <div aria-label={props.ariaLabel} data-value={props.value} />
  ),
  renderArrowHeadPreview: (value: string) => <span data-arrow-head-preview={value} />,
}));

vi.mock('../sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sections')>()),
  CollapsibleSection: (props: React.PropsWithChildren<{ label: string }>) => (
    <section data-label={props.label}>{props.children}</section>
  ),
  PanelSection: (props: React.PropsWithChildren<{ label: string; value?: React.ReactNode }>) => (
    <div data-label={props.label} data-value={String(props.value ?? '')}>
      {props.children}
    </div>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function render(node: React.ReactNode): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function createProps() {
  return {
    applyArrowPatch: vi.fn(),
    arrowHeadOptions: [{ label: 'Triangle', value: 'triangle' }],
    commitPendingSelectionSettings: vi.fn(),
    previewArrowPatch: vi.fn(),
    toNumber: (value: string, fallback: number) => Number(value) || fallback,
  };
}

describe('arrow head sections', () => {
  it('renders start and end head size sliders with normalized defaults and limits', () => {
    const markup = renderToStaticMarkup(
      <>
        {renderArrowHeadSections(
          createProps() as never,
          {
            endHead: 'triangle',
            startHead: 'none',
          } as never
        )}
      </>
    );

    expect(markup).toContain('shared.ui.compact-inspector.numeric-row');
    expect(markup).toContain('editor.compact.arrowStartHeadSize');
    expect(markup).toContain('editor.compact.arrowEndHeadSize');
    expect(markup).toContain('value="1"');
    expect(markup).toContain('>x</span>');
  });
});

describe('arrow head authored values', () => {
  it('renders authored head size values', () => {
    const markup = renderToStaticMarkup(
      <>
        {renderArrowHeadSections(
          createProps() as never,
          {
            endHead: 'triangle',
            endHeadSize: 4,
            startHead: 'none',
            startHeadSize: 2,
          } as never
        )}
      </>
    );

    expect(markup).toContain('value="2"');
    expect(markup).toContain('value="4"');
    expect(markup).toContain('>x</span>');
  });
});

describe('arrow head preview callbacks', () => {
  it('previews normalized head size changes', () => {
    const props = createProps();
    render(
      <>
        {renderArrowHeadSections(
          props as never,
          {
            endHead: 'triangle',
            startHead: 'none',
          } as never
        )}
      </>
    );

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="editor.compact.arrowStartHeadSize increase"]'
        )
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      container
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="editor.compact.arrowEndHeadSize increase"]'
        )
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    expect(props.previewArrowPatch).toHaveBeenCalledWith({ startHeadSize: 1.1 });
    expect(props.previewArrowPatch).toHaveBeenCalledWith({ endHeadSize: 1.1 });
    expect(props.commitPendingSelectionSettings).toHaveBeenCalledTimes(2);
  });
});
