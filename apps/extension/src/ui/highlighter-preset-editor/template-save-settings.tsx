import { useEffect, useState } from 'react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { CompactSelect } from '../compact-inspector-controls';

type TemplateSaveOption = { label: string; value: string };

function normalizeTemplateName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

export function TemplateSaveSettings(props: {
  createActionLabel: string;
  createLabel: string;
  createdStatusLabel?: string;
  disabled?: boolean;
  duplicateNameErrorLabel: string;
  error?: string | null;
  isSaving?: boolean;
  nameLabel: string;
  onCreate: (name: string) => Promise<boolean>;
  onFloatingInteractionChange?: (open: boolean) => void;
  onOverwrite: (templateId: string) => Promise<boolean>;
  options: TemplateSaveOption[];
  overwriteActionLabel: string;
  overwriteLabel: string;
  overwrittenStatusLabel?: string;
  selectLabel: string;
}) {
  const [name, setName] = useState('');
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const normalizedName = normalizeTemplateName(name);
  const hasDuplicateName =
    normalizedName.length > 0 &&
    props.options.some((option) => normalizeTemplateName(option.label) === normalizedName);

  useEffect(() => {
    if (!selectedId) return;
    if (props.options.some((option) => option.value === selectedId)) return;
    setSelectedId('');
  }, [props.options, selectedId]);

  const unavailable = props.disabled === true || props.isSaving === true;
  return (
    <div className="grid gap-3" data-ui="shared.highlighter-template-save-settings">
      <div className="grid gap-1.5">
        <label className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {props.createLabel}
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <ProductInput
            aria-label={props.nameLabel}
            aria-invalid={hasDuplicateName}
            className="sniptale-input-compact cursor-text"
            disabled={unavailable}
            maxLength={64}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setStatus(null);
            }}
            onBlur={() => setIsNameFocused(false)}
            onFocus={() => setIsNameFocused(true)}
            placeholder={isNameFocused ? '' : props.nameLabel}
            style={{ cursor: 'text' }}
            type="text"
            value={name}
          />
          <ProductActionButton
            compact
            disabled={!name.trim() || hasDuplicateName || unavailable}
            onClick={() =>
              void props.onCreate(name.trim()).then((saved) => {
                if (!saved) return;
                setName('');
                setStatus(props.createdStatusLabel ?? null);
              })
            }
          >
            {props.createActionLabel}
          </ProductActionButton>
        </div>
      </div>
      <div className="h-px bg-[var(--sniptale-color-border-soft)]" />
      <div className="grid gap-1.5">
        <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {props.overwriteLabel}
        </div>
        <CompactSelect
          appearance="plain"
          aria-label={props.overwriteLabel}
          disabled={unavailable || props.options.length === 0}
          onChange={(templateId) => {
            setSelectedId(templateId);
            setStatus(null);
          }}
          {...(props.onFloatingInteractionChange
            ? { onOpenChange: props.onFloatingInteractionChange }
            : {})}
          options={props.options}
          placeholder={props.selectLabel}
          value={selectedId}
        />
        <ProductActionButton
          compact
          disabled={!selectedId || unavailable}
          onClick={() =>
            void props.onOverwrite(selectedId).then((saved) => {
              if (saved) setStatus(props.overwrittenStatusLabel ?? null);
            })
          }
          tone="secondary"
        >
          {props.overwriteActionLabel}
        </ProductActionButton>
      </div>
      {hasDuplicateName ? (
        <div className="text-[10px] text-[var(--sniptale-color-danger)]" role="alert">
          {props.duplicateNameErrorLabel}
        </div>
      ) : props.error ? (
        <div className="text-[10px] text-[var(--sniptale-color-danger)]" role="alert">
          {props.error}
        </div>
      ) : status ? (
        <div className="text-[10px] text-[var(--sniptale-color-text-secondary)]" role="status">
          {status}
        </div>
      ) : null}
    </div>
  );
}
