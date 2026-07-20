import React, { useMemo, useState } from 'react';
import { Calendar, Link, Monitor } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  orderTechnicalDataKinds,
  type EditorTechnicalDataLayout,
  type EditorTechnicalDataKind,
} from '../controller/tools/technical-data';
import {
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECTION_LABEL_CLASS_NAME,
  INSPECTOR_SECTION_VALUE_CLASS_NAME,
} from './chrome';
import { cx } from '../chrome/ui';

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

const pickerCardClassName = {
  compact: 'rounded-[10px] px-2.5 py-2',
  expanded: 'rounded-[12px] px-3 py-2.5',
} as const;

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
  variant: TechnicalDataPickerVariant;
}

interface TechnicalDataOptionListProps {
  selectedKinds: readonly EditorTechnicalDataKind[];
  setSelectedKinds: React.Dispatch<React.SetStateAction<EditorTechnicalDataKind[]>>;
  variant: TechnicalDataPickerVariant;
}

function toggleTechnicalDataKind(
  selectedKinds: readonly EditorTechnicalDataKind[],
  kind: EditorTechnicalDataKind
): EditorTechnicalDataKind[] {
  return selectedKinds.includes(kind)
    ? selectedKinds.filter((selectedKind) => selectedKind !== kind)
    : [...selectedKinds, kind];
}

function getTechnicalDataLayoutLabel(layout: EditorTechnicalDataLayout): string {
  return translate(
    layout === 'column'
      ? 'editor.compact.technicalDataLayoutColumn'
      : 'editor.compact.technicalDataLayoutRow'
  );
}

function getNextTechnicalDataLayout(layout: EditorTechnicalDataLayout): EditorTechnicalDataLayout {
  return layout === 'column' ? 'row' : 'column';
}

function TechnicalDataLayoutToggle(props: {
  layout: EditorTechnicalDataLayout;
  setLayout: React.Dispatch<React.SetStateAction<EditorTechnicalDataLayout>>;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-0.5">
      <span className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
        {translate('editor.compact.technicalDataLayout')}
      </span>
      <button
        type="button"
        aria-label={translate('editor.compact.technicalDataLayout')}
        className={cx(
          INSPECTOR_SECTION_VALUE_CLASS_NAME,
          'rounded-[6px] px-1.5 py-0.5 transition',
          'hover:bg-[color:var(--sniptale-color-surface-hover)]',
          'hover:text-[color:var(--sniptale-color-accent-emphasis)]',
          'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_22%,transparent)]'
        )}
        onClick={() => props.setLayout((layout) => getNextTechnicalDataLayout(layout))}
      >
        {getTechnicalDataLayoutLabel(props.layout)}
      </button>
    </div>
  );
}

function TechnicalDataOptionRow({
  checked,
  onToggle,
  option,
  variant,
}: TechnicalDataOptionRowProps) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center gap-3 transition',
        'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
        checked && 'bg-[color:var(--sniptale-color-accent-soft)]',
        pickerCardClassName[variant]
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-[color:var(--sniptale-color-border-strong)]"
      />
      <span className="text-[color:var(--sniptale-color-text-secondary)]">{option.icon}</span>
      <span className="text-sm font-medium text-[color:var(--sniptale-color-text-primary)]">
        {translate(option.labelKey)}
      </span>
    </label>
  );
}

function TechnicalDataOptionList({
  selectedKinds,
  setSelectedKinds,
  variant,
}: TechnicalDataOptionListProps) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {technicalDataOptions.map((option) => {
        const checked = selectedKinds.includes(option.kind);

        return (
          <TechnicalDataOptionRow
            key={option.kind}
            checked={checked}
            onToggle={() =>
              setSelectedKinds((currentKinds) => toggleTechnicalDataKind(currentKinds, option.kind))
            }
            option={option}
            variant={variant}
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

  const [selectedKinds, setSelectedKinds] = useState<EditorTechnicalDataKind[]>([]);
  const [layout, setLayout] = useState<EditorTechnicalDataLayout>('column');
  const orderedKinds = useMemo(() => orderTechnicalDataKinds(selectedKinds), [selectedKinds]);
  const canInsert = orderedKinds.length > 0;

  const handleInsert = () => {
    if (!canInsert) {
      return;
    }

    onInsert(orderedKinds, layout);
    setSelectedKinds([]);
  };

  return (
    <div className="space-y-3">
      <TechnicalDataLayoutToggle layout={layout} setLayout={setLayout} />
      <TechnicalDataOptionList
        selectedKinds={selectedKinds}
        setSelectedKinds={setSelectedKinds}
        variant={variant}
      />
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
        {translate('common.actions.add')}
      </button>
    </div>
  );
};
