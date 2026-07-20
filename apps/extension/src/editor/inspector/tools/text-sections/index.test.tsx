// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockCompactInput,
  MockCompactRange,
  MockCompactSelect,
  MockEditorColorControl,
  MockEditorIconButton,
  MockNumericRow,
  MockPreviewTileGrid,
  MockSegmentedSelector,
  MockSelectField,
  MockToggleGrid,
} from './index.mock-ui.test-support';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  CompactInput: MockCompactInput,
  CompactRange: MockCompactRange,
  CompactSelect: MockCompactSelect,
  ColorField: MockEditorColorControl,
  NumericRow: MockNumericRow,
  SelectField: MockSelectField,
  PreviewTileGrid: MockPreviewTileGrid,
  SegmentedSelector: MockSegmentedSelector,
  ToggleGrid: MockToggleGrid,
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  EditorColorControl: MockEditorColorControl,
  EditorIconButton: MockEditorIconButton,
}));
vi.mock('../sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sections')>()),
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
}));
vi.mock('../../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren) => (
    <div data-testid="text-preset-header">{props.children}</div>
  ),
}));
import { createToolsPanelProps } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderTextControlsSection } from './';
import { assertTextControlsLabels, assertTextSectionPatchCalls } from './index.test-support';
let container: HTMLDivElement | null = null,
  root: Root | null = null;
function renderTextSections(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
}
function cleanupTextSectionsDom() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}
function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function clickTextSectionButton(selector: string) {
  container?.querySelector<HTMLButtonElement>(selector)?.click();
}
function commitTextSectionInput(selector: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(selector);
  if (!input) {
    return;
  }
  setInputValue(input, value);
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}
function commitTextSectionInputAt(selector: string, index: number, value: string) {
  const input = container?.querySelectorAll<HTMLInputElement>(selector)[index];
  if (!input) {
    return;
  }
  setInputValue(input, value);
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}
function createTextControlsProps() {
  const applyTextPatch = vi.fn();
  const applyTextStyle = vi.fn();
  const props = createToolsPanelProps({
    applyTextPatch,
    applyTextStyle,
    fontOptions: [
      { value: 'sans', label: 'Sans' },
      { value: 'mono', label: 'Mono' },
    ],
    highlightedTool: 'text',
    textLayoutModeOptions: [
      { value: 'auto', label: 'Auto' },
      { value: 'fixed-width', label: 'Fixed width' },
    ],
    textAlignOptions: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ],
    textVerticalAlignOptions: [
      { value: 'top', label: 'Top' },
      { value: 'center', label: 'Center' },
      { value: 'bottom', label: 'Bottom' },
    ],
    toNumber: (value: string, fallback: number) => Number.parseInt(value, 10) || fallback,
  }) as any;
  props.inspectorToolSettings.text.fontWeight = 'bold';
  return { applyTextPatch, applyTextStyle, props };
}
function triggerTextSectionInteractions() {
  [
    '[data-testid="select-editor.compact.font-mono"]',
    '[aria-label="editor.compact.textAlign"] button[aria-label="Center"]',
    '[aria-label="editor.compact.verticalAlign"] button[aria-label="Bottom"]',
    '[data-testid="color-editor.compact.textColor"]',
    '[data-testid="color-editor.compact.backgroundColor"]',
    '[data-testid="color-editor.compact.color"]',
    '[data-testid="preview-editor.compact.textColor"]',
    '[data-testid="preview-editor.compact.backgroundColor"]',
    '[data-testid="preview-editor.compact.color"]',
    'button[aria-label="editor.compact.bold"]',
  ].forEach(clickTextSectionButton);
  commitTextSectionInput('[data-testid="range-editor.compact.shadowSize"]', '30');
  commitTextSectionInput('[data-testid="range-editor.compact.shadowAngle"]', '135');
  commitTextSectionInput('[data-testid="range-editor.compact.shadowDistance"]', '18');
  commitTextSectionInput('[data-testid="range-editor.compact.shadowBlur"]', '24');
  commitTextSectionInput('[data-testid="range-editor.compact.fontSize"]', '42');
  commitTextSectionInputAt('[data-testid="range-editor.compact.opacity"]', 0, '50');
  commitTextSectionInputAt('[data-testid="range-editor.compact.opacity"]', 1, '45');
}
describe('editor inspector text sections', () => {
  beforeEach(cleanupTextSectionsDom);
  it('renders the canonical text controls surface and routes updates', () => {
    const { applyTextPatch, applyTextStyle, props } = createTextControlsProps();
    renderTextSections(renderTextControlsSection(props));
    assertTextControlsLabels(container);
    triggerTextSectionInteractions();
    assertTextSectionPatchCalls({ applyTextPatch, applyTextStyle, props });
    props.toolPresetHeader = {} as never;
    renderTextSections(renderTextControlsSection(props));
    expect(container?.querySelector('[data-testid="text-preset-header"]')).not.toBeNull();
  });
});
