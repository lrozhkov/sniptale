import { Plus } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import { CheckboxField, SegmentedRow } from '../../ui/compact-inspector-controls';
import React, { useMemo } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import {
  orderTechnicalDataKinds,
  type EditorTechnicalDataLayout,
  type EditorTechnicalDataKind,
} from '../../features/editor/document/technical-data';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from './chrome';
import { cx } from '../chrome/ui';
import { useTechnicalDataPreference } from './technical-data-preference';
import { EditorInspectorDetails } from './grouped';
import { EditorTechnicalDataTextSettings } from './technical-data-text-settings';

type TechnicalDataPickerVariant = 'compact' | 'expanded';

type TechnicalDataOption = {
  kind: EditorTechnicalDataKind;
  labelKey: 'editor.compact.pageUrl' | 'editor.compact.dateTime' | 'editor.compact.browser';
};

const technicalDataOptions: readonly TechnicalDataOption[] = [
  {
    kind: 'url',
    labelKey: 'editor.compact.pageUrl',
  },
  {
    kind: 'date',
    labelKey: 'editor.compact.dateTime',
  },
  {
    kind: 'browser',
    labelKey: 'editor.compact.browser',
  },
];

const pickerButtonClassName = {
  compact: 'px-3.5',
  expanded: 'px-4',
} as const;

interface EditorTechnicalDataPickerProps {
  onInsert: (kinds: readonly EditorTechnicalDataKind[], layout: EditorTechnicalDataLayout) => void;
  variant?: TechnicalDataPickerVariant;
}

interface TechnicalDataOptionRowProps {
  checked: boolean;
  onToggle: () => void;
  option: TechnicalDataOption;
}

interface TechnicalDataOptionListProps {
  selectedKinds: readonly EditorTechnicalDataKind[];
  onToggleKind: (kind: EditorTechnicalDataKind) => void;
}

function getTechnicalDataLayoutLabel(layout: EditorTechnicalDataLayout): string {
  return translate(
    layout === 'column'
      ? 'editor.compact.technicalDataLayoutColumn'
      : 'editor.compact.technicalDataLayoutRow'
  );
}

function TechnicalDataLayoutToggle(props: {
  layout: EditorTechnicalDataLayout;
  onSelectLayout: (layout: EditorTechnicalDataLayout) => void;
}) {
  return (
    <InspectorParameterRow
      label={translate('editor.compact.technicalDataLayout')}
      valueOptions={(['column', 'row'] as const).map(getTechnicalDataLayoutLabel)}
    >
      <SegmentedRow
        ariaLabel={translate('editor.compact.technicalDataLayout')}
        value={props.layout}
        onChange={props.onSelectLayout}
        columns={2}
        options={(['column', 'row'] as const).map((value) => ({
          value,
          label: getTechnicalDataLayoutLabel(value),
        }))}
      />
    </InspectorParameterRow>
  );
}

function TechnicalDataOptionRow({ checked, onToggle, option }: TechnicalDataOptionRowProps) {
  return (
    <div className={cx('min-w-0', 'text-[color:var(--sniptale-color-text-secondary)]', 'w-full')}>
      <CheckboxField
        shape="round"
        dataUi={`editor.technical-data.field-${option.kind}`}
        label={translate(option.labelKey)}
        value={checked}
        onChange={onToggle}
      />
    </div>
  );
}

function TechnicalDataOptionList({ selectedKinds, onToggleKind }: TechnicalDataOptionListProps) {
  return (
    <div
      role="group"
      aria-label={translate('editor.compact.technicalDataFields')}
      className="sniptale-parameter-stack"
    >
      {technicalDataOptions.map((option) => {
        const checked = selectedKinds.includes(option.kind);

        return (
          <TechnicalDataOptionRow
            key={option.kind}
            checked={checked}
            onToggle={() => onToggleKind(option.kind)}
            option={option}
          />
        );
      })}
    </div>
  );
}

export const EditorTechnicalDataPicker: React.FC<EditorTechnicalDataPickerProps> = ({
  onInsert,
  variant = 'expanded',
}) => {
  useAppLocale();

  const { layout, saveError, saveSelection, selectLayout, selectedKinds, toggleKind } =
    useTechnicalDataPreference();
  const orderedKinds = useMemo(() => orderTechnicalDataKinds(selectedKinds), [selectedKinds]);
  const canInsert = orderedKinds.length > 0;

  const handleInsert = () => {
    if (!canInsert) {
      return;
    }

    onInsert(orderedKinds, layout);
    saveSelection(orderedKinds);
  };

  return (
    <InspectorDisclosurePreferences scope="editor:technical-data">
      <div className="space-y-2">
        <EditorInspectorDetails
          label={translate('editor.compact.technicalDataFields')}
          preferenceId="fields"
          initiallyOpen
          level="section"
        >
          <TechnicalDataOptionList selectedKinds={selectedKinds} onToggleKind={toggleKind} />
        </EditorInspectorDetails>
        <EditorInspectorDetails
          label={translate('editor.compact.technicalDataTextSettings')}
          preferenceId="text-settings"
          level="section"
        >
          <EditorTechnicalDataTextSettings />
        </EditorInspectorDetails>
        {orderedKinds.length > 1 ? (
          <TechnicalDataLayoutToggle layout={layout} onSelectLayout={selectLayout} />
        ) : null}
        {saveError ? (
          <p role="alert" className="text-xs text-[color:var(--sniptale-color-text-primary)]">
            {translate('editor.compact.technicalDataPreferenceSaveFailed')}
          </p>
        ) : null}
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          disabled={!canInsert}
          onClick={handleInsert}
          className={cx(
            INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
            'justify-center',
            pickerButtonClassName[variant]
          )}
        >
          <Plus size={16} aria-hidden="true" />
          {translate('editor.compact.technicalDataInsert')}
        </ProductActionButton>
      </div>
    </InspectorDisclosurePreferences>
  );
};
