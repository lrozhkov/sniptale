import React, { useMemo, useState } from 'react';
import { Calendar, Link, Monitor } from 'lucide-react';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  orderTechnicalDataKinds,
  type EditorTechnicalDataLayout,
  type EditorTechnicalDataKind,
} from '../controller/tools/technical-data';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME, INSPECTOR_SECTION_LABEL_CLASS_NAME } from './chrome';
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

function TechnicalDataLayoutToggle(props: {
  layout: EditorTechnicalDataLayout;
  setLayout: React.Dispatch<React.SetStateAction<EditorTechnicalDataLayout>>;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
        {translate('editor.compact.technicalDataLayout')}
      </h3>
      <SegmentedRow
        ariaLabel={translate('editor.compact.technicalDataLayout')}
        columns={2}
        options={(['column', 'row'] as const).map((layout) => ({
          value: layout,
          label: getTechnicalDataLayoutLabel(layout),
        }))}
        value={props.layout}
        onChange={props.setLayout}
      />
    </section>
  );
}

function TechnicalDataOptionRow({ checked, onToggle, option }: TechnicalDataOptionRowProps) {
  return (
    <div data-inspector-toggle className="flex min-h-8 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-xs text-[color:var(--sniptale-color-text-secondary)]">
        {option.icon}
        {translate(option.labelKey)}
      </span>
      <ProductGlassSwitch
        on={checked}
        aria-label={translate(option.labelKey)}
        aria-pressed={checked}
        onClick={onToggle}
      />
    </div>
  );
}

function TechnicalDataOptionList({
  selectedKinds,
  setSelectedKinds,
  variant,
}: TechnicalDataOptionListProps) {
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
      <section className="space-y-2.5">
        <TechnicalDataOptionList
          selectedKinds={selectedKinds}
          setSelectedKinds={setSelectedKinds}
          variant={variant}
        />
      </section>
      {orderedKinds.length > 1 ? (
        <TechnicalDataLayoutToggle layout={layout} setLayout={setLayout} />
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
  );
};
