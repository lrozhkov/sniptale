// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { SelectedElementInspector } from './element';
import { FrameFields } from './frame';
import { clampScenarioNumber, SCENARIO_INSPECTOR_LIMITS } from './constraints';
import { ProjectPresentationFields } from './project-presentation';
import { SlideCanvasFields } from './slide-canvas';
import { SlidePresentationFields } from './slide-presentation';

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

it('passes explicit constraints to frame, slide, build, and grid numeric fields', () => {
  const text = createScenarioTextElement({ frame: { height: 120, width: 320, x: 40, y: 80 } });
  const slide = createScenarioSlide();
  const project = createScenarioProjectV3('Constraints');

  render(
    <>
      <SelectedElementInspector element={text} onUpdateElement={vi.fn()} />
      <FrameFields element={text} onFrameChange={vi.fn()} />
      <SlideCanvasFields slide={slide} onUpdateSlide={vi.fn()} />
      <SlidePresentationFields slide={slide} onUpdateSlide={vi.fn()} />
      <ProjectPresentationFields
        presentation={project.presentation}
        onUpdatePresentation={vi.fn()}
      />
    </>
  );

  expect(numberField('X')).toMatchObject({ max: '7680', min: '-7680', scrub: 'true' });
  expect(numberField('Width', { min: '1' })).toMatchObject({ max: '7680', min: '1' });
  expect(numberField(translate('scenario.editor.width'), { min: '320' })).toMatchObject({
    max: '7680',
    min: '320',
  });
  expect(numberField(translate('scenario.editor.showAtClick'))).toMatchObject({
    max: '999',
    min: '0',
  });
  expect(numberField(translate('scenario.editor.clicks'))).toMatchObject({
    max: '999',
    min: '0',
  });
  expect(numberField(translate('scenario.editor.gridMargin'))).toMatchObject({
    max: '320',
    min: '0',
    scrub: 'true',
  });
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

function numberField(label: string, matcher: { min?: string } = {}) {
  const fields = Array.from(
    container?.querySelectorAll<HTMLElement>(`[data-label="${label}"]`) ?? []
  );
  const field = fields.find((candidate) =>
    matcher.min === undefined ? true : candidate.dataset['min'] === matcher.min
  );
  expect(field).not.toBeNull();
  return {
    max: field?.dataset['max'],
    min: field?.dataset['min'],
    scrub: field?.dataset['scrub'],
    step: field?.dataset['step'],
  };
}
