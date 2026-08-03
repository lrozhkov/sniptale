// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioV3EditorShell } from './view';

const imageImportMock = vi.hoisted(() => ({ insertImageFileIntoSelectedSlide: vi.fn() }));
const scenarioExportMock = vi.hoisted(() => ({ buildScenarioDeckExport: vi.fn() }));
const scenarioStoreMock = vi.hoisted(() => ({ getScenarioAssetBlob: vi.fn() }));
const browserDriverMock = vi.hoisted(() => ({ downloadScenarioEditorBlob: vi.fn() }));
const aiSelectionMock = vi.hoisted(() => ({ requestAIModelSelectionBootstrap: vi.fn() }));
vi.mock('../project/export/deck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project/export/deck')>()),
  buildScenarioDeckExport: scenarioExportMock.buildScenarioDeckExport,
}));
vi.mock('../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/store/public')>()),
  getScenarioAssetBlob: scenarioStoreMock.getScenarioAssetBlob,
}));
vi.mock('./image-import', () => ({
  insertImageFileIntoSelectedSlide: imageImportMock.insertImageFileIntoSelectedSlide,
}));
vi.mock('../platform/browser-driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/browser-driver')>()),
  downloadScenarioEditorBlob: browserDriverMock.downloadScenarioEditorBlob,
}));
vi.mock('../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: aiSelectionMock.requestAIModelSelectionBootstrap,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createShellProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Demo scenario');
  return {
    ...project,
    slides: [{ ...project.slides[0]!, id: 'slide-1', title: 'Intro' }],
  };
}

function renderShell(project = createShellProject()) {
  const onProjectChange = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioV3EditorShell project={project} onProjectChange={onProjectChange} />);
  });

  return { onProjectChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  imageImportMock.insertImageFileIntoSelectedSlide.mockResolvedValue(undefined);
  scenarioExportMock.buildScenarioDeckExport.mockResolvedValue({
    blob: new Blob(['export']),
    filename: 'deck.html',
    format: 'html',
    missingAssetIds: [],
  });
  aiSelectionMock.requestAIModelSelectionBootstrap.mockResolvedValue({
    defaultModelId: 'model-1',
    models: [],
    providers: [],
  });
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

function clickButton(label: string) {
  const button = getButton(label);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function getButton(label: string) {
  return container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"], [title="${label}"]`);
}

describe('scenario v3 editor shell layout', () => {
  it('renders toolbar, slide rail, canvas, and inspector as one editor surface', () => {
    renderShell();

    expect(container?.querySelector('[data-ui="scenario.v3-shell.root"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="scenario.floating-chrome.root"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="scenario.slide-rail.panel"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="scenario.canvas.stage"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="scenario.inspector.panel"]')).not.toBeNull();
  });

  it('exposes screenshot and step actions without canvas object tools', () => {
    renderShell();

    expect(getButton(translate('scenario.editor.addScreenshot'))).not.toBeNull();
    expect(getButton(translate('scenario.editor.addStep'))).not.toBeNull();
    expect(getButton(translate('scenario.editor.insertText'))).toBeNull();
    expect(getButton(translate('scenario.editor.insertShape'))).toBeNull();
    expect(getButton(translate('scenario.editor.insertArrow'))).toBeNull();
    expect(getButton(translate('scenario.editor.layouts'))).toBeNull();
  });
});

it('keeps slide inspector edits on the shared project state', () => {
  const { onProjectChange } = renderShell();
  const titleInput = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input:not([type="file"])') ?? []
  ).find((input) => input.value === 'Intro');

  expect(titleInput).not.toBeNull();
  act(() => {
    if (!titleInput) {
      throw new Error('Expected slide title input');
    }
    setNativeFieldValue(titleInput, 'Edited title');
    titleInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onProjectChange).toHaveBeenCalledWith(
    expect.objectContaining({
      slides: [expect.objectContaining({ title: 'Edited title' })],
    })
  );
});

describe('scenario v3 editor shell step-first surface', () => {
  it('does not expose click-build state for legacy slides', () => {
    const project = createShellProject();
    renderShell({
      ...project,
      slides: [{ ...project.slides[0]!, clicks: { count: 1, initialIndex: 1 } }],
    });

    expect(container?.querySelector('[data-ui="scenario.floating.build-timeline"]')).toBeNull();
    expect(container?.textContent).not.toContain('1/1');
  });

  it('does not expose layers as a second navigation model', () => {
    renderShell();
    expect(container?.querySelector('[data-ui="scenario.floating.layers-panel"]')).toBeNull();
  });
});

describe('scenario v3 editor shell toolbar actions', () => {
  it('keeps layout, grid, and template controls out of guide authoring', () => {
    renderShell();

    expect(getButton(translate('scenario.editor.toggleGrid'))).toBeNull();
    expect(getButton(translate('scenario.editor.toggleMagnet'))).toBeNull();
    expect(getButton(translate('scenario.editor.layouts'))).toBeNull();
    expect(container?.querySelector('[data-ui="scenario.templates.picker"]')).toBeNull();
    expect(container?.querySelector('[data-ui="scenario.templates.manager"]')).toBeNull();
  });

  it('exports the v3 deck from toolbar UI through the browser download seam', async () => {
    const project = createShellProject();
    renderShell(project);

    clickButton('Экспорт');
    expect(container?.textContent).toContain('Export scenario deck');

    await clickButtonText('Export');

    expect(scenarioExportMock.buildScenarioDeckExport).toHaveBeenCalledWith({
      getAssetBlob: scenarioStoreMock.getScenarioAssetBlob,
      options: {
        assetMode: 'embed',
        format: 'html',
        includeMissingPlaceholders: true,
        includeNotes: true,
        includeSourceJson: false,
      },
      project,
    });
    expect(browserDriverMock.downloadScenarioEditorBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'deck.html'
    );
  });
});

describe('scenario v3 editor shell image import', () => {
  it('surfaces image import failures without mutating the project', async () => {
    imageImportMock.insertImageFileIntoSelectedSlide.mockRejectedValueOnce(
      new Error('image import failed')
    );
    const { onProjectChange } = renderShell();

    await dispatchImageFile(new File(['image'], 'broken.png', { type: 'image/png' }));

    expect(onProjectChange).not.toHaveBeenCalled();
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
      translate('scenario.editor.v3OperationFailed')
    );
  });
});

function setNativeFieldValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
}

async function clickButtonText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}

async function dispatchImageFile(file: File) {
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  await act(async () => {
    if (!input) {
      throw new Error('Expected image import input');
    }
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}
