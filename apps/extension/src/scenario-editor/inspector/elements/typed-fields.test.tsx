// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { ArrowElementFields, LineElementFields } from './connectors';
import { CalloutElementFields } from './callout';
import { CodeElementFields } from './code';
import { ImageElementFields } from './image';
import { ShapeElementFields } from './shape';
import { TextElementFields } from './text';
import type { ScenarioInspectorElementPatch } from '../types';

type NumberFieldMockProps = {
  constraint?: { max: number; min: number; scrub?: boolean; step?: number };
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  scrub?: boolean;
};

type SelectMockProps = {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string }>;
};

vi.mock('../fields', () => ({
  InspectorColorField: (props: { label: string; onCommit: (value: string) => void }) => (
    <button type="button" onClick={() => props.onCommit(`${props.label}-color`)}>
      {props.label}
    </button>
  ),
  InspectorBooleanField: (props: { label: string; onChange: (value: boolean) => void }) => (
    <button type="button" onClick={() => props.onChange(true)}>
      {props.label}
    </button>
  ),
  InspectorNativeSelect: (props: SelectMockProps) => (
    <button type="button" onClick={() => props.onChange(props.options.at(-1)!.value)}>
      {props.label}
    </button>
  ),
  InspectorNumberField: (props: NumberFieldMockProps) => (
    <button
      type="button"
      data-label={props.label}
      data-max={props.constraint?.max ?? props.max}
      data-min={props.constraint?.min ?? props.min}
      data-scrub={String(props.scrub ?? props.constraint?.scrub ?? false)}
      onClick={() => props.onCommit(7)}
    >
      {props.label}
    </button>
  ),
  InspectorRangeField: (props: { label: string; onCommit: (value: number) => void }) => (
    <button type="button" onClick={() => props.onCommit(700)}>
      {props.label}
    </button>
  ),
  InspectorSection: (props: { children: ReactNode }) => <section>{props.children}</section>,
  InspectorTextField: (props: { label: string; onCommit: (value: string) => void }) => (
    <button type="button" onClick={() => props.onCommit(`${props.label}-text`)}>
      {props.label}
    </button>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type OnChangeMock = ReturnType<typeof vi.fn<(patch: ScenarioInspectorElementPatch) => void>>;

function renderNode(render: (onChange: OnChangeMock) => ReactNode) {
  const onChange = vi.fn<(patch: ScenarioInspectorElementPatch) => void>();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(render(onChange));
  });

  return onChange;
}

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

it('routes text, code, and shape field callbacks through i18n-backed controls', () => {
  const textCalls = clickAll(
    renderNode((onChange) => (
      <TextElementFields element={createScenarioTextElement()} onChange={onChange} />
    ))
  );
  expect(textCalls).toContainEqual({ style: { fontWeight: 700 } });
  expect(textCalls).toContainEqual({ style: { align: 'right' } });
  expect(
    clickAll(
      renderNode((onChange) => (
        <CodeElementFields element={createScenarioCodeElement()} onChange={onChange} />
      ))
    )
  ).toContainEqual({ style: { textColor: expect.stringContaining('color') } });
  expect(
    clickAll(
      renderNode((onChange) => (
        <ShapeElementFields element={createScenarioShapeElement()} onChange={onChange} />
      ))
    )
  ).toContainEqual({ cornerRadius: 7 });
});

it('routes connector and callout field callbacks through i18n-backed controls', () => {
  expect(
    clickAll(
      renderNode((onChange) => (
        <LineElementFields element={createScenarioLineElement()} onChange={onChange} />
      ))
    )
  ).toContainEqual({ dash: 'dotted' });
  expect(
    clickAll(
      renderNode((onChange) => (
        <ArrowElementFields element={createScenarioArrowElement()} onChange={onChange} />
      ))
    )
  ).toContainEqual({ head: 'both' });
  expect(
    clickAll(
      renderNode((onChange) => (
        <CalloutElementFields element={createScenarioCalloutElement()} onChange={onChange} />
      ))
    )
  ).toContainEqual({ connector: { end: { x: 520, y: 240 }, start: { x: 760, y: 240 } } });
});

it('removes an existing callout connector through the same owner control', () => {
  const element = createScenarioCalloutElement({
    connector: {
      end: { x: 520, y: 240 },
      start: { x: 760, y: 240 },
    },
  });
  const calls = clickAll(
    renderNode((onChange) => <CalloutElementFields element={element} onChange={onChange} />)
  );

  expect(calls).toContainEqual({ connector: null });
});

it('passes explicit scrub constraints into bounded element numeric fields', () => {
  renderNode((onChange) => (
    <>
      <TextElementFields element={createScenarioTextElement()} onChange={onChange} />
      <CodeElementFields element={createScenarioCodeElement()} onChange={onChange} />
      <ShapeElementFields element={createScenarioShapeElement()} onChange={onChange} />
      <CalloutElementFields element={createScenarioCalloutElement()} onChange={onChange} />
      <LineElementFields element={createScenarioLineElement()} onChange={onChange} />
      <ImageElementFields element={createScenarioImageElement()} onChange={onChange} />
    </>
  ));

  expect(numberField(translate('scenario.editor.fontSize'))).toMatchObject({
    max: '320',
    min: '8',
    scrub: 'true',
  });
  expect(numberField(translate('scenario.editor.strokeWidth'))).toMatchObject({
    max: '64',
    min: '0',
    scrub: 'true',
  });
  expect(numberField(translate('scenario.editor.cornerRadius'))).toMatchObject({
    max: '240',
    min: '0',
    scrub: 'true',
  });
  expect(numberField(translate('scenario.editor.borderWidth'))).toMatchObject({
    max: '64',
    min: '0',
    scrub: 'true',
  });
  expect(numberField(translate('scenario.editor.startX'))).toMatchObject({
    max: '7680',
    min: '-7680',
    scrub: 'true',
  });
  expect(numberField(translate('scenario.editor.contentScale'))).toMatchObject({
    max: '10',
    min: '0.1',
    scrub: 'true',
  });
});

function clickAll(onChange: OnChangeMock) {
  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click());
  });
  return onChange.mock.calls.map((call) => call[0]);
}

function numberField(label: string) {
  const field = container?.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
  expect(field).not.toBeNull();
  return {
    max: field?.dataset['max'],
    min: field?.dataset['min'],
    scrub: field?.dataset['scrub'],
  };
}
