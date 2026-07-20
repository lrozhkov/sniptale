import { translate } from '../../../platform/i18n';
import type { EditorInspectorTemplateCardState, EditorInspectorTemplateGroupState } from './types';

export function createEditorInspectorTemplateGroups(
  templates: readonly EditorInspectorTemplateCardState[]
): EditorInspectorTemplateGroupState[] {
  return [
    {
      id: 'system',
      label: translate('editor.compact.templateSystemGroup'),
      templates: templates.filter((template) => template.system),
    },
    {
      id: 'user',
      label: translate('editor.compact.templateUserGroup'),
      templates: templates.filter((template) => !template.system),
    },
  ];
}
