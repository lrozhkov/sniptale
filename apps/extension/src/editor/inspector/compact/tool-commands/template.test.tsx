// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { translate } from '../../../../platform/i18n';
import { buildToolTemplateCommand, prependToolTemplateCommand } from './template';
import type { ToolCommandParams } from './types';

function createParams(): ToolCommandParams {
  const params = createInspectorCommandParams() as unknown as ToolCommandParams;
  params.highlightedTool = 'pencil';
  params.toolPresetHeader = {
    activeView: 'parameters',
    saveDisabled: false,
    savePanel: null,
    templates: [
      {
        id: 'template-1',
        label: 'Template 1',
        preview: <span data-preview="template-1" />,
        selected: true,
        onApply: vi.fn(),
      },
      {
        id: 'template-2',
        label: 'Template 2',
        preview: <span data-preview="template-2" />,
        selected: false,
        onApply: vi.fn(),
      },
    ],
    onOpenSavePanel: vi.fn(),
    onViewChange: vi.fn(),
  };
  return params;
}

it('builds the tool template selector from the existing preset header state', () => {
  const command = buildToolTemplateCommand(createParams());

  expect(command?.id).toBe('pencil-template');
  expect(command?.title).toBe(translate('editor.toolbar.preset'));
  expect(command?.value).toBe('Template 1');
  expect(renderToStaticMarkup(<>{command?.content}</>)).toContain('data-editor-template-cards');
});

it('prepends templates and removes the legacy shape preset duplicate', () => {
  const commands = prependToolTemplateCommand(createParams(), [
    { id: 'shape-preset', title: 'Legacy shape preset', trigger: 'PRE' },
    { id: 'shape-fill-color', title: 'Fill', trigger: 'FILL' },
  ]);

  expect(commands.map((command) => command.id)).toEqual(['pencil-template', 'shape-fill-color']);
});

it('keeps commands unchanged when a tool has no preset header', () => {
  const params = createParams();
  params.toolPresetHeader = null;
  const commands = [{ id: 'fill', title: 'Fill', trigger: 'FILL' }];
  expect(buildToolTemplateCommand(params)).toBeNull();
  expect(prependToolTemplateCommand(params, commands)).toBe(commands);
});

it('allows applying grouped templates and opening, saving and cancelling the tool preset draft', () => {
  const params = createParams();
  const state = params.toolPresetHeader!;
  const apply = vi.fn();
  const save = vi.fn();
  const cancel = vi.fn();
  state.templates[1]!.onApply = apply;
  state.groups = [{ id: 'user', label: 'My templates', templates: state.templates }];
  state.savePanel = {
    canSave: true,
    mode: 'create',
    name: 'New template',
    overwriteOptions: [],
    overwriteDisabled: true,
    overwriteTargetId: '',
    onCancel: cancel,
    onModeChange: vi.fn(),
    onNameChange: vi.fn(),
    onOverwriteTargetChange: vi.fn(),
    onSave: save,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <CommandPressScope.Provider value>
          {buildToolTemplateCommand(params)?.content}
        </CommandPressScope.Provider>
      )
    );
    const applyButton = [...host.querySelectorAll('button')].find(
      (node) => node.getAttribute('title') === 'Template 2'
    );
    expect(applyButton).toBeDefined();
    act(() => applyButton!.click());
    expect(apply).toHaveBeenCalledOnce();
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-editor-template-save-trigger]')!.click()
    );
    expect(state.onOpenSavePanel).toHaveBeenCalledOnce();
    const panel = host.querySelector('[data-editor-template-save-panel]')!;
    const byText = (key: Parameters<typeof translate>[0]) =>
      [...panel.querySelectorAll('button')].find((node) => node.textContent === translate(key))!;
    act(() => byText('common.actions.save').click());
    act(() => byText('editor.compact.cancel').click());
    expect(save).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    state.saveDisabled = true;
    state.templates = [];
    state.groups = [];
    state.savePanel = null;
    const empty = buildToolTemplateCommand(params)!;
    expect(empty.value).toBe(translate('editor.compact.templateSingle'));
    act(() => root.render(<>{empty.content}</>));
    const disabled = host.querySelector<HTMLButtonElement>('[data-editor-template-save-trigger]')!;
    expect(disabled.disabled).toBe(true);
    act(() => disabled.click());
    expect(state.onOpenSavePanel).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
