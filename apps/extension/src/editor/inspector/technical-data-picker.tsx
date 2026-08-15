import React, { useMemo, useState } from 'react';
import { Calendar, Link, Monitor } from 'lucide-react';
import {
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassOptionGrid,
  ProductGlassRow,
  ProductGlassSectionLabel,
} from '@sniptale/ui/product-glass-controls';
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
    <div className="space-y-1.5">
      <ProductGlassSectionLabel>
        {translate('editor.compact.technicalDataLayout')}
      </ProductGlassSectionLabel>
      <ProductGlassRow>
        {(['column', 'row'] as const).map((layout) => (
          <ProductGlassChip
            key={layout}
            active={props.layout === layout}
            aria-pressed={props.layout === layout}
            onClick={() => props.setLayout(layout)}
          >
            {getTechnicalDataLayoutLabel(layout)}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>
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
    <ProductGlassChip
      active={checked}
      aria-pressed={checked}
      className={variant === 'expanded' ? 'min-h-9' : ''}
      onClick={onToggle}
    >
      <ProductGlassChipIcon>{option.icon}</ProductGlassChipIcon>
      {translate(option.labelKey)}
    </ProductGlassChip>
  );
}

function TechnicalDataOptionList({
  selectedKinds,
  setSelectedKinds,
  variant,
}: TechnicalDataOptionListProps) {
  return (
    <ProductGlassOptionGrid aria-label={translate('editor.compact.technicalDataFields')}>
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
    </ProductGlassOptionGrid>
  );
}

function TechnicalDataPreview(props: {
  kinds: readonly EditorTechnicalDataKind[];
  layout: EditorTechnicalDataLayout;
}) {
  const labels = props.kinds.map((kind) => {
    const option = technicalDataOptions.find((candidate) => candidate.kind === kind);
    return option ? translate(option.labelKey) : kind;
  });

  return (
    <section
      aria-label={translate('editor.compact.technicalDataPreview')}
      aria-live="polite"
      className="space-y-1.5 border-t border-[color:var(--sniptale-color-border-soft)] pt-2.5"
    >
      <div className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
        {translate('editor.compact.technicalDataPreview')}
      </div>
      {labels.length === 0 ? (
        <p className="mt-1.5 text-xs text-[color:var(--sniptale-color-text-secondary)]">
          {translate('editor.compact.technicalDataPreviewEmpty')}
        </p>
      ) : (
        <div
          className={cx(
            'mt-2 text-xs text-[color:var(--sniptale-color-text-primary)]',
            props.layout === 'row' ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : 'space-y-1'
          )}
        >
          {labels.map((label, index) => (
            <React.Fragment key={props.kinds[index]}>
              {props.layout === 'row' && index > 0 ? (
                <span aria-hidden="true" className="text-[color:var(--sniptale-color-text-muted)]">
                  ·
                </span>
              ) : null}
              <span>{label}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
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
      <ProductGlassSectionLabel>
        {translate('editor.compact.technicalDataFields')}
      </ProductGlassSectionLabel>
      <TechnicalDataOptionList
        selectedKinds={selectedKinds}
        setSelectedKinds={setSelectedKinds}
        variant={variant}
      />
      <TechnicalDataLayoutToggle layout={layout} setLayout={setLayout} />
      <TechnicalDataPreview kinds={orderedKinds} layout={layout} />
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
