import {
  EDITOR_ARROW_HEAD_SIZE_DEFAULT,
  EDITOR_ARROW_HEAD_SIZE_MAX,
  EDITOR_ARROW_HEAD_SIZE_MIN,
  normalizeEditorArrowHeadSize,
} from '../../../../features/editor/document/arrow';
import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { SelectField, type CompactSelectOption } from '../../../chrome/ui';
import { renderArrowHeadPreview } from '../../tools/arrow-head-grid';
import { buildRangeCompactCommand } from './shared';
import type { ToolCommandParams } from './types';

type ArrowSettings = ToolCommandParams['inspectorToolSettings']['arrow'];
type ArrowHeadField = 'startHead' | 'endHead';
type ArrowHeadSizeField = 'startHeadSize' | 'endHeadSize';
type ArrowHeadOption = CompactSelectOption<ArrowSettings[ArrowHeadField]>;

function buildArrowHeadSelectOptions(options: readonly ArrowHeadOption[]): ArrowHeadOption[] {
  return options.map((option) => ({
    ...option,
    icon: (
      <span className="flex h-5 w-12 items-center text-[color:var(--sniptale-color-accent)]">
        {renderArrowHeadPreview(option.value)}
      </span>
    ),
  }));
}

function getHeadLabelKey(head: ArrowHeadField) {
  return head === 'startHead' ? 'editor.compact.arrowStartHead' : 'editor.compact.arrowEndHead';
}

function getHeadSizeLabelKey(sizeField: ArrowHeadSizeField) {
  return sizeField === 'startHeadSize'
    ? 'editor.compact.arrowStartHeadSize'
    : 'editor.compact.arrowEndHeadSize';
}

export function buildArrowHeadCommand(
  params: ToolCommandParams,
  settings: ArrowSettings,
  head: ArrowHeadField,
  value: string
): CompactCommand {
  const labelKey = getHeadLabelKey(head);
  const token = head === 'startHead' ? 'ST' : 'END';

  return {
    id: `arrow-${head === 'startHead' ? 'start' : 'end'}-head`,
    icon: 'trajectory',
    title: translate(labelKey),
    trigger: <CompactCommandToken>{token}</CompactCommandToken>,
    value,
    content: (
      <CompactCommandField label={translate(labelKey)} value={value}>
        <SelectField
          label={translate(labelKey)}
          value={settings[head]}
          onChange={(nextValue) => params.applyArrowPatch({ [head]: nextValue })}
          options={buildArrowHeadSelectOptions(params.arrowHeadOptions)}
        />
      </CompactCommandField>
    ),
  };
}

export function buildArrowHeadSizeCommand(
  params: ToolCommandParams,
  settings: ArrowSettings,
  sizeField: ArrowHeadSizeField
): CompactCommand {
  const value = settings[sizeField] ?? EDITOR_ARROW_HEAD_SIZE_DEFAULT;
  const label = translate(getHeadSizeLabelKey(sizeField));
  const valueText = `${value}x`;

  return {
    ...buildRangeCompactCommand({
      id: `arrow-${sizeField === 'startHeadSize' ? 'start' : 'end'}-head-size`,
      icon: 'size',
      label,
      token: 'SM',
      value,
      valueText,
      min: EDITOR_ARROW_HEAD_SIZE_MIN,
      max: EDITOR_ARROW_HEAD_SIZE_MAX,
      step: 0.1,
      onChange: (rawValue) =>
        params.previewArrowPatch({
          [sizeField]: normalizeEditorArrowHeadSize(params.toNumber(rawValue, value)),
        }),
      onValueCommit: params.commitPendingSelectionSettings,
    }),
    trigger: (
      <CompactCommandToken className="min-w-8 text-center normal-case tracking-normal">
        {valueText}
      </CompactCommandToken>
    ),
  };
}
