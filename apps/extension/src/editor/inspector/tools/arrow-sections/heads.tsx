import { translate } from '../../../../platform/i18n';
import {
  EDITOR_ARROW_HEAD_SIZE_DEFAULT,
  EDITOR_ARROW_HEAD_SIZE_MAX,
  EDITOR_ARROW_HEAD_SIZE_MIN,
  normalizeEditorArrowHeadSize,
} from '../../../../features/editor/document/arrow';
import { NumericRow } from '../../../chrome/ui';
import { SelectField, type CompactSelectOption } from '../../../chrome/ui';
import { renderArrowHeadPreview } from '../arrow-head-grid';
import { CollapsibleSection } from '../sections';
import type { ArrowControlsProps, ArrowSettings } from './types';

function buildArrowHeadSelectOptions(
  options: readonly CompactSelectOption<ArrowSettings['startHead']>[]
): CompactSelectOption<ArrowSettings['startHead']>[] {
  return options.map((option) => ({
    ...option,
    icon: (
      <span className="flex h-5 w-12 items-center text-[color:var(--sniptale-color-accent)]">
        {renderArrowHeadPreview(option.value)}
      </span>
    ),
  }));
}

function renderArrowHeadSelect(
  label: string,
  value: ArrowSettings['startHead'],
  onChange: (value: ArrowSettings['startHead']) => void,
  options: CompactSelectOption<ArrowSettings['startHead']>[]
) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={buildArrowHeadSelectOptions(options)}
    />
  );
}

function renderArrowHeadSizeSlider(
  props: ArrowControlsProps,
  label: string,
  value: number,
  onChange: (value: number) => void
) {
  return (
    <NumericRow
      label={label}
      min={EDITOR_ARROW_HEAD_SIZE_MIN}
      max={EDITOR_ARROW_HEAD_SIZE_MAX}
      step={0.1}
      unit="x"
      value={value}
      scrub={{ min: EDITOR_ARROW_HEAD_SIZE_MIN, max: EDITOR_ARROW_HEAD_SIZE_MAX, step: 0.1 }}
      onPreviewValue={(next) => onChange(normalizeEditorArrowHeadSize(next))}
      onCommitValue={(next) => {
        onChange(normalizeEditorArrowHeadSize(next));
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

export function renderArrowHeadSections(props: ArrowControlsProps, settings: ArrowSettings) {
  const startHeadSize = settings.startHeadSize ?? EDITOR_ARROW_HEAD_SIZE_DEFAULT;
  const endHeadSize = settings.endHeadSize ?? EDITOR_ARROW_HEAD_SIZE_DEFAULT;

  return (
    <CollapsibleSection
      key="heads"
      label={translate('editor.compact.arrowHeadGroup')}
      defaultOpen={false}
    >
      <div className="space-y-3">
        {renderArrowHeadSelect(
          translate('editor.compact.arrowStartHead'),
          settings.startHead,
          (value) => props.applyArrowPatch({ startHead: value }),
          props.arrowHeadOptions
        )}
        {renderArrowHeadSizeSlider(
          props,
          translate('editor.compact.arrowStartHeadSize'),
          startHeadSize,
          (value) => props.previewArrowPatch({ startHeadSize: value })
        )}
        {renderArrowHeadSelect(
          translate('editor.compact.arrowEndHead'),
          settings.endHead,
          (value) => props.applyArrowPatch({ endHead: value }),
          props.arrowHeadOptions
        )}
        {renderArrowHeadSizeSlider(
          props,
          translate('editor.compact.arrowEndHeadSize'),
          endHeadSize,
          (value) => props.previewArrowPatch({ endHeadSize: value })
        )}
      </div>
    </CollapsibleSection>
  );
}
