import React, { useMemo } from 'react';
import { Calendar, Link, Monitor } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import {
  orderTechnicalDataKinds,
  type EditorTechnicalDataLayout,
  type EditorTechnicalDataKind,
} from '../controller/tools/technical-data';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME, INSPECTOR_SECTION_LABEL_CLASS_NAME } from './chrome';
import { cx } from '../chrome/ui';
import { useTechnicalDataPreference } from './technical-data-preference';
import { EditorInspectorDetails } from './grouped';
import { EditorTechnicalDataTextSettings } from './technical-data-text-settings';

type TechnicalDataPickerVariant = 'compact' | 'expanded';

type TechnicalDataOption = {
  kind: EditorTechnicalDataKind;
  icon: React.ReactNode;
  labelKey: 'editor.compact.pageUrl' | 'editor.compact.dateTime' | 'editor.compact.browser';
};

const technicalDataOptions: readonly TechnicalDataOption[] = [
  {
    kind: 'url',
    icon: <Link size={15} strokeWidth={2} />,
    labelKey: 'editor.compact.pageUrl',
  },
  {
    kind: 'date',
    icon: <Calendar size={15} strokeWidth={2} />,
    labelKey: 'editor.compact.dateTime',
  },
  {
    kind: 'browser',
    icon: <Monitor size={15} strokeWidth={2} />,
    labelKey: 'editor.compact.browser',
  },
];

const pickerButtonClassName = {
  compact: 'px-3.5',
  expanded: 'px-4',
} as const;

const selectedLayoutClassName = [
  'bg-[var(--sniptale-color-surface-panel)] font-medium shadow-sm',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const unselectedLayoutClassName = [
  'text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

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
    <section className="space-y-2.5">
      <h3 className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
        {translate('editor.compact.technicalDataLayout')}
      </h3>
      <div
        role="group"
        aria-label={translate('editor.compact.technicalDataLayout')}
        className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--sniptale-color-surface-hover)] p-1"
      >
        {(['column', 'row'] as const).map((layout) => (
          <button
            key={layout}
            type="button"
            aria-pressed={props.layout === layout}
            className={cx(
              'rounded-md px-2 py-1.5 text-xs',
              'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-focus-ring)]',
              props.layout === layout ? selectedLayoutClassName : unselectedLayoutClassName
            )}
            onClick={() => props.onSelectLayout(layout)}
          >
            {getTechnicalDataLayoutLabel(layout)}
          </button>
        ))}
      </div>
    </section>
  );
}

function TechnicalDataOptionRow({ checked, onToggle, option }: TechnicalDataOptionRowProps) {
  return (
    <label
      className={cx(
        'flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1 text-xs',
        'text-[color:var(--sniptale-color-text-secondary)]',
        'hover:bg-[var(--sniptale-color-surface-hover)]'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="sniptale-checkbox sniptale-checkbox-sm shrink-0"
        data-ui={`editor.technical-data.field-${option.kind}`}
      />
      {option.icon}
      <span>{translate(option.labelKey)}</span>
    </label>
  );
}

function TechnicalDataOptionList({ selectedKinds, onToggleKind }: TechnicalDataOptionListProps) {
  return (
    <div
      role="group"
      aria-label={translate('editor.compact.technicalDataFields')}
      className="space-y-1"
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
      <div className="space-y-3">
        <EditorInspectorDetails
          label={translate('editor.compact.technicalDataTextSettings')}
          preferenceId="text-settings"
          initiallyOpen
          level="section"
        >
          <EditorTechnicalDataTextSettings />
        </EditorInspectorDetails>
        <EditorInspectorDetails
          label={translate('editor.compact.technicalDataFields')}
          preferenceId="fields"
          initiallyOpen
          level="section"
        >
          <div className="space-y-2.5">
            <TechnicalDataOptionList selectedKinds={selectedKinds} onToggleKind={toggleKind} />
            {orderedKinds.length > 1 ? (
              <TechnicalDataLayoutToggle layout={layout} onSelectLayout={selectLayout} />
            ) : null}
          </div>
        </EditorInspectorDetails>
        {saveError ? (
          <p role="alert" className="text-xs text-[color:var(--sniptale-color-text-primary)]">
            {translate('editor.compact.technicalDataPreferenceSaveFailed')}
          </p>
        ) : null}
        {!canInsert ? (
          <p role="status" className="text-xs text-[color:var(--sniptale-color-text-secondary)]">
            {translate('editor.compact.technicalDataPreviewEmpty')}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!canInsert}
          onClick={handleInsert}
          className={cx(
            INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
            'justify-center',
            pickerButtonClassName[variant]
          )}
        >
          {translate('editor.compact.technicalDataInsert')}
        </button>
      </div>
    </InspectorDisclosurePreferences>
  );
};
