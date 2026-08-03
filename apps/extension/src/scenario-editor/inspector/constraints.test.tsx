// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioTextElement } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { SelectedElementInspector } from './element';
import { clampScenarioNumber, SCENARIO_INSPECTOR_LIMITS } from './constraints';

vi.mock('./fields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fields')>()),
  InspectorBooleanField: (props: { label: string }) => <span>{props.label}</span>,
  InspectorColorField: (props: { label: string }) => <span>{props.label}</span>,
  InspectorNativeSelect: (props: { label: string }) => <span>{props.label}</span>,
  InspectorNumberField: (props: {
    constraint?: { max: number; min: number; scrub?: boolean; step?: number };
    label: string;
    max?: number;
    min?: number;
    scrub?: boolean;
    step?: number;
  }) => (
    <span
      data-label={props.label}
      data-max={props.constraint?.max ?? props.max}
      data-min={props.constraint?.min ?? props.min}
      data-scrub={String(props.scrub ?? props.constraint?.scrub ?? false)}
      data-step={props.constraint?.step ?? props.step}
    />
  ),
  InspectorRangeField: (props: { label: string }) => <span>{props.label}</span>,
  InspectorSection: (props: { children: ReactNode; title: string }) => (
    <section aria-label={props.title}>{props.children}</section>
  ),
  InspectorTextField: (props: { label: string }) => <span>{props.label}</span>,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps the selected-element destructive action explicit', () => {
  const text = createScenarioTextElement({ frame: { height: 120, width: 320, x: 40, y: 80 } });
  const onDelete = vi.fn();

  render(
    <SelectedElementInspector
      element={text}
      onDelete={onDelete}
      onEditImageElement={vi.fn()}
      onUpdateElement={vi.fn()}
    />
  );

  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find(
        (button) => button.textContent?.trim() === translate('scenario.editor.removeSelectedItem')
      )
      ?.click();
  });
  expect(onDelete).toHaveBeenCalledOnce();
});

it('clamps scenario inspector numbers against the shared limits', () => {
  expect(clampScenarioNumber(999999, SCENARIO_INSPECTOR_LIMITS.canvasWidth)).toBe(7680);
  expect(clampScenarioNumber(-999999, SCENARIO_INSPECTOR_LIMITS.coordinate)).toBe(-7680);
  expect(clampScenarioNumber(Number.NaN, SCENARIO_INSPECTOR_LIMITS.fontSize)).toBe(8);
});

function render(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}
