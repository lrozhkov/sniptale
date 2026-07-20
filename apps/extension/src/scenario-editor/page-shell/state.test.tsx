// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { useScenarioV3EditorState } from './state';

const imageImportMock = vi.hoisted(() => ({
  insertImageFileIntoSelectedSlide: vi.fn(),
}));

vi.mock('./image-import', () => ({
  insertImageFileIntoSelectedSlide: imageImportMock.insertImageFileIntoSelectedSlide,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let parentProject: ScenarioProjectV3;
let changedProjects: ScenarioProjectV3[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  imageImportMock.insertImageFileIntoSelectedSlide.mockResolvedValue(undefined);
  parentProject = createProject();
  changedProjects = [];
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
  vi.clearAllMocks();
});

it('keeps the selected slide when the parent echoes the same updated project', () => {
  renderHarness();
  clickButton('Select second');
  clickButton('Update selected');

  const echoedProject = changedProjects.at(-1);
  expect(echoedProject).toBeDefined();
  if (!echoedProject) {
    throw new Error('Expected changed project');
  }

  parentProject = echoedProject;
  renderHarness();

  expect(container?.querySelector('[data-testid="selected-slide"]')?.textContent).toBe('slide-2');
});

it('keeps slide and element selection when the parent echoes a cloned updated project', () => {
  renderHarness();
  clickButton('Select second');
  clickButton('Select second element');
  clickButton('Rename selected element');

  const echoedProject = changedProjects.at(-1);
  expect(echoedProject).toBeDefined();
  if (!echoedProject) {
    throw new Error('Expected changed project');
  }

  parentProject = cloneProject(echoedProject);
  renderHarness();

  expect(container?.querySelector('[data-testid="selected-slide"]')?.textContent).toBe('slide-2');
  expect(container?.querySelector('[data-testid="selected-element"]')?.textContent).toBe('text-2');
});

it('ignores stale local project echoes during repeated element updates', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  renderHarness();
  clickButton('Select second');
  clickButton('Select second element');
  clickButton('Set selected element size');
  const firstEcho = changedProjects.at(-1);
  clickButton('Set selected element weight');
  const latestEcho = changedProjects.at(-1);
  expect(firstEcho).toBeDefined();
  expect(latestEcho).toBeDefined();
  if (!firstEcho || !latestEcho) {
    throw new Error('Expected project echoes');
  }

  parentProject = cloneProject(firstEcho);
  renderHarness();

  expect(container?.querySelector('[data-testid="selected-slide"]')?.textContent).toBe('slide-2');
  expect(container?.querySelector('[data-testid="selected-element"]')?.textContent).toBe('text-2');
  expect(latestEcho).not.toBe(firstEcho);
  expect(container?.querySelector('[data-testid="selected-font-size"]')?.textContent).toBe('64');
  expect(container?.querySelector('[data-testid="selected-font-weight"]')?.textContent).toBe('700');
});

it('keeps selected element when the parent refreshes the same project outside local echoes', () => {
  renderHarness();
  clickButton('Select second');
  clickButton('Select second element');
  parentProject = cloneProject({
    ...parentProject,
    name: 'Saved refresh',
    updatedAt: parentProject.updatedAt + 1,
  });

  renderHarness();

  expect(container?.querySelector('[data-testid="selected-slide"]')?.textContent).toBe('slide-2');
  expect(container?.querySelector('[data-testid="selected-element"]')?.textContent).toBe('text-2');
});

it('does not emit stale local state when the parent replaces the project prop', () => {
  renderHarness();
  changedProjects = [];
  parentProject = createProject('external-slide');

  renderHarness();

  expect(changedProjects).toEqual([]);
  expect(container?.querySelector('[data-testid="selected-slide"]')?.textContent).toBe(
    'external-slide'
  );
});

it('emits deck presentation updates through project actions without resetting selection', () => {
  renderHarness();
  clickButton('Select second');
  clickButton('Set graphite theme');

  expect(changedProjects.at(-1)?.presentation.themeId).toBe('graphite');
  expect(container?.querySelector('[data-testid="selected-slide"]')?.textContent).toBe('slide-2');
});

it('surfaces image import operation failures without emitting project changes', async () => {
  imageImportMock.insertImageFileIntoSelectedSlide.mockRejectedValueOnce(
    new Error('image import failed')
  );
  renderHarness();
  changedProjects = [];

  await clickButtonAsync('Import broken image');

  expect(changedProjects).toEqual([]);
  expect(container?.querySelector('[data-testid="operation-error"]')?.textContent).toBe(
    translate('scenario.editor.v3OperationFailed')
  );
});

function renderHarness() {
  act(() => {
    root?.render(
      <EditorHarness
        project={parentProject}
        onProjectChange={(nextProject) => {
          changedProjects.push(nextProject);
        }}
      />
    );
  });
}

function EditorHarness(props: {
  onProjectChange: (project: ScenarioProjectV3) => void;
  project: ScenarioProjectV3;
}) {
  const editor = useScenarioV3EditorState(props);

  return (
    <div>
      <ScenarioEditorStateReadout editor={editor} />
      <ScenarioEditorStateActions editor={editor} />
    </div>
  );
}

type ScenarioEditorState = ReturnType<typeof useScenarioV3EditorState>;

function ScenarioEditorStateReadout({ editor }: { editor: ScenarioEditorState }) {
  return (
    <>
      <span data-testid="selected-slide">{editor.selectedSlide.id}</span>
      <span data-testid="selected-element">{editor.selectedElementId}</span>
      <span data-testid="selected-font-size">
        {editor.selectedElement?.kind === 'text' ? editor.selectedElement.style.fontSize : ''}
      </span>
      <span data-testid="selected-font-weight">
        {editor.selectedElement?.kind === 'text' ? editor.selectedElement.style.fontWeight : ''}
      </span>
      <span data-testid="operation-error">{editor.operationError}</span>
    </>
  );
}

function ScenarioEditorStateActions({ editor }: { editor: ScenarioEditorState }) {
  return (
    <>
      <button type="button" onClick={() => editor.slideActions.selectSlide('slide-2')}>
        Select second
      </button>
      <button type="button" onClick={() => editor.elementActions.selectElement('text-2')}>
        Select second element
      </button>
      <button type="button" onClick={() => editor.slideActions.updateSlide({ title: 'Updated' })}>
        Update selected
      </button>
      <button
        type="button"
        onClick={() => editor.elementActions.updateElement('text-2', { name: 'Renamed' })}
      >
        Rename selected element
      </button>
      <button
        type="button"
        onClick={() => editor.elementActions.updateElement('text-2', { style: { fontSize: 64 } })}
      >
        Set selected element size
      </button>
      <button
        type="button"
        onClick={() =>
          editor.elementActions.updateElement('text-2', { style: { fontWeight: 700 } })
        }
      >
        Set selected element weight
      </button>
      <button
        type="button"
        onClick={() => editor.projectActions.updatePresentation({ themeId: 'graphite' })}
      >
        Set graphite theme
      </button>
      <button
        type="button"
        onClick={() => void editor.elementActions.insertImageFile(createBrokenImageFile())}
      >
        Import broken image
      </button>
    </>
  );
}

function createBrokenImageFile() {
  return new File(['image'], 'broken.png', { type: 'image/png' });
}

function createProject(firstSlideId = 'slide-1'): ScenarioProjectV3 {
  const project = createScenarioProjectV3('State');
  const firstElement = createScenarioTextElement({ text: 'Title' });
  const secondElement = createScenarioTextElement({ text: 'Second' });
  return {
    ...project,
    slides: [
      { ...project.slides[0]!, elements: [{ ...firstElement, id: 'text-1' }], id: firstSlideId },
      { ...project.slides[0]!, elements: [{ ...secondElement, id: 'text-2' }], id: 'slide-2' },
    ],
  };
}

function cloneProject(project: ScenarioProjectV3): ScenarioProjectV3 {
  return {
    ...project,
    slides: project.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) => ({ ...element })),
    })),
    trash: project.trash.map((entry) => ({ ...entry, slide: { ...entry.slide } })),
  };
}

function clickButton(label: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  act(() => {
    button?.click();
  });
}

async function clickButtonAsync(label: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}
