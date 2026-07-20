// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../features/scenario/project/v3';
import { listBundledScenarioTemplates } from '../../features/scenario/project/v3/templates';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioEditorTemplateLibrary } from '../project/templates';
import { useScenarioV3TemplateState } from './template-state';

type TemplateState = ReturnType<typeof useScenarioV3TemplateState>;
type TemplateEditor = Parameters<typeof useScenarioV3TemplateState>[0];

let capturedState: TemplateState | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createEditor(selectedSlide = createScenarioSlide({ title: 'Selected' })) {
  return {
    selectedSlide,
    slideActions: {
      addTemplateSlide: vi.fn(),
      replaceSelectedSlide: vi.fn(),
    },
  } as unknown as TemplateEditor;
}

function renderHook(editor = createEditor()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<TemplateStateHarness editor={editor} />);
  });

  return editor;
}

function TemplateStateHarness(props: { editor: TemplateEditor }) {
  capturedState = useScenarioV3TemplateState(props.editor);
  return null;
}

beforeEach(() => {
  capturedState = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('toggles manager mode and filters imported libraries', () => {
  renderHook();
  const library = createTemplateLibrary(false);
  const activeLibrary = {
    ...createTemplateLibrary(true),
    id: 'library-2',
    templates: [{ ...createTemplate(), templateId: 'team-2' }],
  };

  act(() => capturedState?.openManager());
  expect(capturedState?.panelMode).toBe('manager');
  act(() => capturedState?.saveLibrary(library));
  act(() => capturedState?.saveLibrary(activeLibrary));
  expect(capturedState?.templates.some((template) => template.templateId === 'team')).toBe(false);
  expect(capturedState?.templates.some((template) => template.templateId === 'team-2')).toBe(true);
  act(() => capturedState?.toggleLibrary('library-1'));
  expect(capturedState?.templates.some((template) => template.templateId === 'team')).toBe(true);
  expect(capturedState?.templates.some((template) => template.templateId === 'team-2')).toBe(true);
  act(() => capturedState?.deleteLibrary('library-1'));
  expect(capturedState?.libraries).toEqual([activeLibrary]);
});

it('creates template slides without replacing the selected slide', () => {
  const editor = renderHook(createEditor());
  const template = listBundledScenarioTemplates()[0]!;

  act(() => capturedState?.createSlide(template));

  expect(editor.slideActions.addTemplateSlide).toHaveBeenCalledWith(
    expect.objectContaining({ templateId: template.templateId })
  );
  expect(editor.slideActions.replaceSelectedSlide).not.toHaveBeenCalled();
  expect(capturedState?.panelMode).toBeNull();
});

it('closes the manager panel', () => {
  renderHook(createEditor());

  act(() => capturedState?.openManager());
  act(() => capturedState?.closePanel());

  expect(capturedState?.panelMode).toBeNull();
});

function createTemplateLibrary(enabled: boolean): ScenarioEditorTemplateLibrary {
  return {
    createdAt: 1,
    enabled,
    id: 'library-1',
    name: 'Team library',
    templates: [createTemplate()],
    updatedAt: 1,
  };
}

function createTemplate(): ScenarioTemplateDefinition {
  return {
    catalogRank: 1,
    catalogStatus: 'core',
    description: 'Team',
    group: 'team',
    label: 'Team',
    slide: createScenarioSlide({ title: 'Team' }),
    source: 'imported',
    templateId: 'team',
    version: 1,
  };
}
