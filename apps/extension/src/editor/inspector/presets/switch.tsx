import { translate } from '../../../platform/i18n';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { EditorInspectorPresetViewMode } from './types';

const templateViewGroups: ReadonlyArray<{ id: EditorInspectorPresetViewMode; label: string }> = [
  { id: 'parameters', label: translate('editor.compact.templateParameters') },
  { id: 'templates', label: translate('editor.compact.templateSingle') },
];

export function EditorInspectorPresetViewSwitch(props: {
  activeView: EditorInspectorPresetViewMode;
  onChange: (view: EditorInspectorPresetViewMode) => void;
}) {
  return (
    <SegmentedSwitch
      activeId={props.activeView}
      ariaLabel={translate('editor.compact.templates')}
      dataAttribute={{ 'data-editor-preset-view-switch': 'true' }}
      options={templateViewGroups}
      onChange={props.onChange}
    />
  );
}
