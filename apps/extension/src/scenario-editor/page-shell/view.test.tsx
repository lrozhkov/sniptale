// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { clickScenarioCanvasAt } from './test-support';
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

  it('inserts elements through UI controls and groups undo/redo over project history', () => {
    renderShell();

    clickButton(translate('scenario.editor.insertText'));
    act(() => clickScenarioCanvasAt(container, 120, 96));
    expect(container?.textContent).toContain(translate('scenario.editor.text'));

    clickButton(translate('scenario.editor.undo'));
    expect(
      container?.querySelector('[data-ui="scenario.inspector.layers"]')?.textContent
    ).not.toContain(translate('scenario.editor.text'));

    clickButton(translate('scenario.editor.redo'));
    expect(
      container?.querySelector('[data-ui="scenario.inspector.layers"]')?.textContent
    ).toContain(translate('scenario.editor.text'));
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

describe('scenario v3 editor shell click preview', () => {
  it('starts at the selected slide initial click index', () => {
    const project = createShellProject();
    renderShell({
      ...project,
      slides: [{ ...project.slides[0]!, clicks: { count: 1, initialIndex: 1 } }],
    });

    expect(container?.textContent).toContain('1/1');
  });

  it('advances edit click preview when selecting a delayed build element', async () => {
    const project = createShellProject();
    const delayedElement = {
      ...createScenarioTextElement({
        build: { hideAtClick: null, order: 0, showAtClick: 1 },
        name: 'Step note',
        text: 'Delayed build note',
      }),
      id: 'note-1',
    };
    renderShell({
      ...project,
      slides: [
        {
          ...project.slides[0]!,
          clicks: { count: 1, initialIndex: 0 },
          elements: [delayedElement],
        },
      ],
    });

    clickButton(`${translate('scenario.editor.buildStep')} 0`);

    expect(decodeRenderedSvg()).not.toContain('Delayed');
    await clickFirstLayerButton();
    await act(async () => {
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('1/1');
    expect(decodeRenderedSvg()).toMatch(/Delayed[\s\S]*build note/);
  });
});

describe('scenario v3 editor shell toolbar actions', () => {
  it('opens the template picker and manager from the slide sidebar', () => {
    renderShell();

    const gridButton = getButton(translate('scenario.editor.toggleGrid'));
    expect(gridButton?.getAttribute('data-ui')).toBe('scenario.floating.workspace-panel.grid');
    expect(gridButton?.getAttribute('aria-pressed')).toBe('true');
    clickButton(translate('scenario.editor.toggleGrid'));
    expect(getButton(translate('scenario.editor.toggleGrid'))?.getAttribute('aria-pressed')).toBe(
      null
    );

    clickButton(translate('scenario.editor.layouts'));
    expect(container?.querySelector('[data-ui="scenario.templates.picker"]')).not.toBeNull();
    expect(container?.textContent).not.toContain(translate('scenario.editor.applyTemplate'));

    clickButton(translate('scenario.editor.templateManagerOpen'));
    expect(container?.querySelector('[data-ui="scenario.templates.manager"]')).not.toBeNull();
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

async function clickFirstLayerButton() {
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.inspector.layers"] button'
  );
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

function decodeRenderedSvg() {
  const src = container?.querySelector<HTMLImageElement>('img')?.getAttribute('src') ?? '';
  return decodeURIComponent(src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
}
