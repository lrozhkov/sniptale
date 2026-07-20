// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  createDefaultRichShapeObject,
  createEnabledRichShapeRoughStyle,
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCatalogEntry,
} from '../../../../features/editor/document/rich-shape';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../../tooling/test/harness/editor/ownership/helpers';
import {
  createInspectorCommandParams,
  createToolsPanelProps,
} from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { EditorInspectorToolsPanel } from '../panel';
vi.mock('../../../../platform/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../../../platform/i18n')>(
    '../../../../platform/i18n'
  );
  const labels: Record<string, string> = {
    'editor.compact.chooseToolOrObject': 'Choose a tool or select an object',
    'editor.compact.richShapeFill': 'Fill',
    'editor.compact.richShapeFillMode': 'Fill',
    'editor.compact.richShapeLine': 'Line',
    'editor.compact.richShapeRoughFillStyle': 'Fill sketch',
    'editor.compact.richShapeRoughFillCrossHatch': 'Cross hatch',
    'editor.compact.richShapeText': 'Text in shape',
    'editor.compact.richShapeFillNone': 'None',
    'editor.compact.richShapeFillSolid': 'Solid',
    'editor.compact.richShapeFillGradient': 'Gradient',
    'editor.compact.richShapeBeginArrowhead': 'Begin',
    'editor.compact.richShapeEndArrowhead': 'End',
    'editor.compact.bold': 'Bold',
    'editor.compact.italic': 'Italic',
    'editor.compact.underline': 'Underline',
    'editor.compact.strikethrough': 'Strike',
  };
  return {
    ...actual,
    translate: (key: string) => labels[key] ?? key,
    useAppLocale: vi.fn(),
  };
});
function getEntry(id: string): EditorBuiltInShapeCatalogEntry {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing shape entry: ${id}`);
  }
  return entry;
}
function createSelectedShape(entry: EditorBuiltInShapeCatalogEntry) {
  return createDefaultRichShapeObject({
    id: `shape-${entry.id}`,
    shapeFamily: entry.insertDefaults.shapeFamily,
    shapeKind: entry.insertDefaults.shapeKind,
    source: {
      formatVersion: '1',
      importedAt: null,
      itemId: entry.id,
      libraryId: null,
      name: entry.labelFallback,
      type: 'built-in',
    },
  });
}
function renderRichShapeInspector(
  entryId: string,
  overrides: Record<string, unknown> = {},
  shapeOverrides: Parameters<typeof createDefaultRichShapeObject>[0] = {}
) {
  const entry = getEntry(entryId);
  const props = createToolsPanelProps({
    highlightedTool: 'rectangle',
    richShapeSelection: { ...createSelectedShape(entry), ...shapeOverrides },
    selection: {
      ...createInspectorCommandParams().selection,
      selectedObjectType: 'rich-shape',
    },
    ...overrides,
  });
  renderWithController(<EditorInspectorToolsPanel {...(props as any)} />, createControllerMock());
  return props;
}
function clickButtonWithText(text: string, index = 0) {
  const buttons = Array.from(document.querySelectorAll('button')).filter(
    (button) => button.textContent === text
  );
  buttons[index]?.click();
}
function clickButtonContaining(text: string) {
  Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
    .find((button) => button.textContent?.includes(text))
    ?.click();
}
function changeInput(label: string, value: string, index = 0) {
  const input = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      `input[aria-label="${label}"], textarea[aria-label="${label}"]`
    )
  )[index];
  if (!input) {
    throw new Error(`Missing input: ${label}`);
  }
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
}
async function selectOption(label: string, optionText: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!trigger) {
    throw new Error(`Missing select: ${label}`);
  }
  await act(async () => {
    trigger.click();
  });
  await act(async () => undefined);
  await act(async () => {
    clickButtonWithText(optionText);
  });
}

function expectRichShapeGroups(entryId: string, expectedLabels: string[]) {
  renderRichShapeInspector(entryId);
  expectedLabels.forEach((label) => {
    expect(document.body.textContent).toContain(label);
  });
  expect(document.body.textContent).not.toContain('Source');
  expect(document.body.textContent).not.toContain('Size and position');
  expect(document.body.textContent).not.toContain('Image and pattern fill');
  expect(document.body.textContent).not.toContain('Sketch style');
  cleanupDom();
}

async function editRoughLineAndFillControls() {
  await act(async () => {
    changeInput('editor.compact.richShapeRoughness', '2.2');
    changeInput('editor.compact.richShapeBowing', '1.4');
    changeInput('editor.compact.richShapeRoughness', '2.8', 1);
    changeInput('editor.compact.richShapeBowing', '0.8', 1);
    changeInput('editor.compact.richShapeTransparency', '35', 1);
    changeInput('editor.compact.richShapeHachureGap', '5');
    changeInput('editor.compact.richShapeHachureAngle', '25');
    changeInput('editor.compact.richShapeFillWeight', '3');
  });
  await selectOption('Fill sketch', 'Cross hatch');
}

function expectRoughLineAndFillPatches(props: ReturnType<typeof createToolsPanelProps>) {
  [
    { rough: { enabled: true, roughness: 2.2 } },
    { rough: { enabled: true, bowing: 1.4 } },
    { rough: { enabled: true, fillRoughness: 2.8 } },
    { rough: { enabled: true, fillBowing: 0.8 } },
    { rough: { enabled: true, fillTransparency: 0.35 } },
    { rough: { enabled: true, hachureGap: 5 } },
    { rough: { enabled: true, hachureAngle: 25 } },
    { rough: { enabled: true, fillWeight: 3 } },
    { rough: { enabled: true, fillStyle: 'cross-hatch' } },
  ].forEach((patch) => {
    expect(props.applyRichShapePatch).toHaveBeenCalledWith(patch);
  });
}

async function editRichShapeFormattingControls() {
  await selectOption('Fill', 'Solid');
  await selectOption('Fill', 'Gradient');
  await act(async () => {
    changeInput('editor.compact.richShapeTransparency', '40', 0);
    changeInput('editor.gradient.angle', '35');
    changeInput('editor.compact.strokeWidth', '7');
    changeInput('editor.compact.richShapeTransparency', '30', 1);
  });
  await selectOption('highlighter.editor.styleLabel', 'editor.compact.richShapeDashDot');
  await act(async () => {
    clickButtonContaining('highlighter.editor.shadowLabel');
    clickButtonContaining('editor.compact.richShapeReflection');
  });
  await act(async () => {
    changeInput('editor.compact.fontSize', '22');
    clickButtonWithText('Bold');
    clickButtonWithText('Italic');
    changeInput('editor.compact.richShapeDistance', '12', 0);
    changeInput('editor.compact.richShapeSize', '60');
  });
}

function expectRichShapeFormattingPatches(props: ReturnType<typeof createToolsPanelProps>) {
  expect(props.arrangeSelection).not.toHaveBeenCalled();
  expect(props.applyRichShapePatch).toHaveBeenCalledWith(
    expect.objectContaining({ style: expect.objectContaining({ fillTransparency: 0 }) })
  );
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ style: { line: { width: 7 } } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    style: { line: { transparency: 0.4 } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    style: { line: { dashStyle: 'dash-dot' } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { fontSize: 22 } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    effects: { shadow: { distance: 12 } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    effects: { shadow: { enabled: true, opacity: 0.6 } },
  });
}

it.each([
  ['rectangle', ['Fill', 'Line', 'Text in shape']],
  ['line', ['Line']],
  ['arrow', ['Line']],
  ['block-arrow', ['Fill', 'Line', 'Text in shape']],
])('renders rich shape inspector formatting groups for %s', (entryId, expectedLabels) => {
  expectRichShapeGroups(entryId, expectedLabels);
});

it('shows arrowhead controls only for line-like rich shapes', () => {
  renderRichShapeInspector('rectangle');
  expect(document.body.textContent).not.toContain('Begin');
  expect(document.body.textContent).not.toContain('End');
  cleanupDom();

  renderRichShapeInspector('arrow');
  expect(document.body.textContent).toContain('Begin');
  expect(document.body.textContent).toContain('End');
  cleanupDom();
});

it('applies shape formatting patches and leaves no-selection on the default inspector', async () => {
  const props = renderRichShapeInspector('rectangle');
  await selectOption('Fill', 'None');

  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    rough: { enabled: false },
    style: { fillTransparency: 1 },
  });
  cleanupDom();

  renderRichShapeInspector('rectangle', {
    highlightedTool: 'select',
    richShapeSelection: null,
    selection: { ...createInspectorCommandParams().selection, hasSelection: false },
  });
  expect(document.body.textContent).toContain('Choose a tool or select an object');
  cleanupDom();
});

it('moves sketch line and fill controls into the line and fill groups', async () => {
  renderRichShapeInspector('rectangle');
  expect(document.body.textContent).not.toContain('Sketch style');
  expect(
    document.querySelector<HTMLInputElement>(`[aria-label="editor.compact.richShapeRoughness"]`)
  ).not.toBeNull();
  cleanupDom();

  const props = renderRichShapeInspector(
    'rectangle',
    {},
    { rough: createEnabledRichShapeRoughStyle('rough-inspector') }
  );
  expect(document.body.textContent).toContain('Fill sketch');

  await editRoughLineAndFillControls();

  expectRoughLineAndFillPatches(props);
  cleanupDom();
});

it('applies fill, line, text, and effects edits from controls', async () => {
  const baseShape = createDefaultRichShapeObject();
  const props = renderRichShapeInspector(
    'rectangle',
    {},
    {
      effects: {
        ...baseShape.effects,
        shadow: { ...baseShape.effects.shadow, enabled: true, opacity: 0.2 },
        reflection: { ...baseShape.effects.reflection, enabled: true, opacity: 0.2, size: 0.25 },
      },
    }
  );

  await editRichShapeFormattingControls();

  expectRichShapeFormattingPatches(props);
  expect(document.body.textContent).not.toContain('Image and pattern fill');
  cleanupDom();
});
