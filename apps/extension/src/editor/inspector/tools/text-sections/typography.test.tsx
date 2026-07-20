// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../sections', () => ({
  CollapsibleSection: (props: { children?: React.ReactNode }) => (
    <section>{props.children}</section>
  ),
  HeaderValueToggleSection: () => null,
  PanelSection: (props: {
    children?: React.ReactNode;
    label?: React.ReactNode;
    value?: React.ReactNode;
  }) => (
    <section data-testid={`panel-${String(props.label)}`}>
      <div>{String(props.label)}</div>
      <div>{String(props.value ?? '')}</div>
      {props.children}
    </section>
  ),
  renderSelectionActionsSectionWithController: () => null,
}));

import { renderTextTypographyGrid } from './typography';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderTypography(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('routes the normal-weight toggle branch without max-width controls', () => {
  const applyTextPatch = vi.fn();
  const applyTextStyle = vi.fn();
  const grid = renderTextTypographyGrid(
    {
      applyTextPatch,
      applyTextStyle,
    } as never,
    {
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
      linethrough: false,
    } as never
  ) as React.ReactElement<any>;

  renderTypography(grid);

  expect(container?.querySelector('[data-ui="shared.ui.compact-inspector.toggle-grid"]')).not.toBe(
    null
  );
  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.toggle-grid"]')?.className
  ).toContain('grid-cols-4');
  expect(container?.innerHTML).not.toContain('2xl:grid-cols-2');

  [
    'editor.compact.bold',
    'editor.compact.italic',
    'editor.compact.underline',
    'editor.compact.strikethrough',
  ].forEach((label) => {
    container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
  });

  expect(applyTextStyle).toHaveBeenCalledWith('bold');
  expect(applyTextStyle).toHaveBeenCalledWith('italic');
  expect(applyTextStyle).toHaveBeenCalledWith('underline');
  expect(applyTextStyle).toHaveBeenCalledWith('linethrough');
  expect(container?.innerHTML).not.toContain('editor.compact.maxWidth');
  expect(applyTextPatch).not.toHaveBeenCalledWith({ maxWidth: expect.any(Number) });
});
