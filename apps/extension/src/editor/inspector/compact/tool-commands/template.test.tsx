import { renderToStaticMarkup } from 'react-dom/server';
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
