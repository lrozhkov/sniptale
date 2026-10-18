import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { CompactSelect } from '../compact-inspector-controls';
import { useInspectorLayout } from '../compact-inspector-controls/layout';
import { InspectorFieldClear } from '../compact-inspector-controls/text-field';

type TemplateSaveOption = { label: string; value: string };

function normalizeTemplateName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

const templateSaveRoleClasses = {
  compact: {
    labelClassName:
      'text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]',
    fieldGroup: 'grid gap-1',
    commandRow: 'grid grid-cols-[minmax(0,1fr)_auto] gap-1',
    feedbackSize: 'text-[12px] leading-4',
  },
  pending: {
    labelClassName: 'text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]',
    fieldGroup: 'grid gap-1.5',
    commandRow: 'grid grid-cols-[minmax(0,1fr)_auto] gap-1.5',
    feedbackSize: 'text-[10px]',
  },
} as const;

function TemplateNameField(props: {
  disabled: boolean;
  invalid: boolean;
  label: string;
  onChange(value: string): void;
  value: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const inspector = useInspectorLayout();
  const [focused, setFocused] = useState(false);
  const field = (
    <ProductInput
      ref={input}
      aria-label={props.label}
      aria-invalid={props.invalid}
      className="sniptale-input-compact cursor-text"
      disabled={props.disabled}
      maxLength={64}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      placeholder={focused ? '' : props.label}
      style={{ cursor: 'text' }}
      type="text"
      value={props.value}
    />
  );
  if (!inspector) return field;
  return (
    <div className="sniptale-text-value">
      {field}
      {!props.disabled && props.value.length > 0 ? (
        <InspectorFieldClear label={props.label} target={input} />
      ) : null}
    </div>
  );
}

export function TemplateSaveSettings(props: {
  createActionLabel: string;
  createLabel: string;
  createdStatusLabel?: string;
  disabled?: boolean;
  duplicateNameErrorLabel: string;
  error?: string | null;
  isSaving?: boolean;
  leadingContent?: ReactNode;
  nameLabel: string;
  onCreate: (name: string) => Promise<boolean>;
  onCreated?: () => void;
  onFloatingInteractionChange?: (open: boolean) => void;
  onOverwrite: (templateId: string) => Promise<boolean>;
  onOverwritten?: (templateId: string) => void;
  options: TemplateSaveOption[];
  overwriteActionLabel: string;
  overwriteLabel: string;
  overwrittenStatusLabel?: string;
  selectLabel: string;
}) {
  const [name, setName] = useState('');
  const inspector = useInspectorLayout();
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
  const roleClasses = templateSaveRoleClasses[inspector ? 'compact' : 'pending'];
  let feedback: ReactNode = null;
  if (status)
    feedback = (
      <div
        className={`${roleClasses.feedbackSize} text-[var(--sniptale-color-text-secondary)]`}
        role="status"
      >
        {status}
      </div>
    );
  if (props.error)
    feedback = (
      <div
        className={`${roleClasses.feedbackSize} text-[var(--sniptale-color-danger)]`}
        role="alert"
      >
        {props.error}
      </div>
    );
  if (hasDuplicateName)
    feedback = (
      <div
        className={`${roleClasses.feedbackSize} text-[var(--sniptale-color-danger)]`}
        role="alert"
      >
        {props.duplicateNameErrorLabel}
      </div>
    );
  return (
    <div className="grid gap-3" data-ui="shared.highlighter-template-save-settings">
      {props.leadingContent ? (
        <>
          {props.leadingContent}
          <div className="h-px bg-[var(--sniptale-color-border-soft)]" />
        </>
      ) : null}
      <div className={roleClasses.fieldGroup}>
        <label className={roleClasses.labelClassName}>{props.createLabel}</label>
        <div className={roleClasses.commandRow}>
          <TemplateNameField
            disabled={unavailable}
            invalid={hasDuplicateName}
            label={props.nameLabel}
            onChange={(value) => {
              setName(value);
              setStatus(null);
            }}
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
                props.onCreated?.();
              })
            }
          >
            {props.createActionLabel}
          </ProductActionButton>
        </div>
      </div>
      <div className="h-px bg-[var(--sniptale-color-border-soft)]" />
      <div className={roleClasses.fieldGroup}>
        <div className={roleClasses.labelClassName}>{props.overwriteLabel}</div>
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
              if (!saved) return;
              setStatus(props.overwrittenStatusLabel ?? null);
              props.onOverwritten?.(selectedId);
            })
          }
          tone="secondary"
        >
          {props.overwriteActionLabel}
        </ProductActionButton>
      </div>
      {feedback}
    </div>
  );
}
