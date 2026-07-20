import { translate } from '../../../../platform/i18n';
import { CompactCommandField, type CompactCommand } from '..';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../../chrome';
import { EditorInspectorTemplateCards } from '../../presets/cards';
import { EditorInspectorPresetSavePanel } from '../../presets/save-panel';
import { TablerIcon } from '../tabler-icon';
import type { ToolCommandParams } from './types';

function getToolTemplateCardsProps(state: NonNullable<ToolCommandParams['toolPresetHeader']>) {
  return state.groups === undefined
    ? { templates: state.templates }
    : { groups: state.groups, templates: state.templates };
}

function renderToolTemplateTrigger(
  selectedTemplate:
    | NonNullable<ToolCommandParams['toolPresetHeader']>['templates'][number]
    | undefined
) {
  return selectedTemplate ? (
    <span
      aria-hidden="true"
      className={[
        'flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px]',
        'text-[color:var(--sniptale-color-accent)]',
      ].join(' ')}
    >
      {selectedTemplate.preview}
    </span>
  ) : (
    <TablerIcon icon="tabler:template" />
  );
}

export function buildToolTemplateCommand(params: ToolCommandParams): CompactCommand | null {
  const state = params.toolPresetHeader;
  if (!state) {
    return null;
  }

  const selectedTemplate = state.templates.find((template) => template.selected);
  const label = translate('editor.toolbar.preset');
  const value = selectedTemplate?.label ?? translate('editor.compact.templateSingle');
  const templateCardsProps = getToolTemplateCardsProps(state);
  const trigger = renderToolTemplateTrigger(selectedTemplate);

  return {
    id: `${params.highlightedTool}-template`,
    icon: 'preset',
    title: label,
    trigger,
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <div className="space-y-3">
          <EditorInspectorTemplateCards {...templateCardsProps} />
          <button
            type="button"
            disabled={state.saveDisabled}
            onClick={state.onOpenSavePanel}
            className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
            data-editor-template-save-trigger="true"
          >
            {translate('editor.compact.saveAsTemplate')}
          </button>
          {state.savePanel ? <EditorInspectorPresetSavePanel state={state.savePanel} /> : null}
        </div>
      </CompactCommandField>
    ),
  };
}

export function prependToolTemplateCommand(
  params: ToolCommandParams,
  commands: CompactCommand[]
): CompactCommand[] {
  const command = buildToolTemplateCommand(params);
  return command ? [command, ...commands.filter((item) => item.id !== 'shape-preset')] : commands;
}
