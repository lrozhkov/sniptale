import { useEffect, useRef, useState } from 'react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  settingsCompactWorkbenchClassName,
  settingsMetaLabelClassName,
} from '../../../section-surface';
import { useSettingsStore } from '../../../runtime/store/useSettingsStore';
import { translate, useAppLocale } from '../../../../platform/i18n';
import {
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_CATEGORIES,
  FILENAME_TOKENS,
  isValidFilenameTemplate,
  resolveFilename,
  type FilenameRules,
} from '../../../../features/file-naming/rules';

const PREVIEW_CONTEXT = {
  timestamp: Date.UTC(2026, 8, 26, 12, 30, 45, 123),
  timezoneOffset: 0,
  operationId: 'example',
};

/** Draft edits remain recoverable until the existing settings authority confirms a write. */
function useFilenameRulesDraft() {
  const { settings, updateSettings, isLoading } = useSettingsStore();
  const [draft, setDraft] = useState<FilenameRules>(settings.filenameRules ?? { template: '' });
  const [status, setStatus] = useState<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');
  const writing = useRef(false);
  useEffect(() => {
    if (status === 'saved') setDraft(settings.filenameRules ?? { template: '' });
  }, [settings.filenameRules, status]);
  const valid = Object.values(draft).every(isValidFilenameTemplate);
  const disabled = isLoading || status === 'saving';
  const change = (field: keyof FilenameRules, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus('unsaved');
  };
  const save = async () => {
    if (!valid || disabled || writing.current) return;
    writing.current = true;
    setStatus('saving');
    try {
      await updateSettings({ filenameRules: draft });
      setStatus('saved');
    } catch {
      setStatus('failed');
    } finally {
      writing.current = false;
    }
  };
  return {
    draft,
    previewRules: status === 'saved' && settings.filenameRules === null ? null : draft,
    status,
    valid,
    disabled,
    change,
    save,
    reset: () => {
      setDraft({ template: '' });
      setStatus('unsaved');
    },
  };
}

/** Central naming controls, previews and category inheritance. */
export function FilenameRulesSettings() {
  useAppLocale();
  const { draft, previewRules, status, valid, disabled, change, save, reset } =
    useFilenameRulesDraft();
  const [activeField, setActiveField] = useState<keyof FilenameRules>('template');
  const inputs = useRef<Partial<Record<keyof FilenameRules, HTMLInputElement | null>>>({});
  const field = (key: keyof FilenameRules) => {
    const invalid = !isValidFilenameTemplate(draft[key] ?? '');
    return (
      <div key={key} className="space-y-1">
        <label htmlFor={`filename-${key}`} className="text-sm font-medium">
          {translate(`settings.filenameRules.${key}`)}
        </label>
        <ProductInput
          ref={(element) => {
            inputs.current[key] = element;
          }}
          id={`filename-${key}`}
          value={draft[key] ?? ''}
          disabled={disabled}
          maxLength={200}
          placeholder={
            key === 'template'
              ? DEFAULT_FILENAME_TEMPLATE
              : translate('settings.filenameRules.inherit')
          }
          aria-invalid={invalid}
          aria-describedby={invalid ? `filename-${key}-error` : undefined}
          onFocus={() => setActiveField(key)}
          onChange={(event) => change(key, event.target.value)}
          className="w-full"
        />
        {invalid ? (
          <p id={`filename-${key}-error`} role="alert" className="text-sm">
            {translate('settings.filenameRules.invalid')}
          </p>
        ) : null}
      </div>
    );
  };
  const sectionClassName = [
    settingsCompactWorkbenchClassName,
    'space-y-3 border-t border-[var(--sniptale-color-border-subtle)] pt-5',
  ].join(' ');
  return (
    <section className={sectionClassName} aria-labelledby="filename-heading">
      <h2 id="filename-heading" className={settingsMetaLabelClassName}>
        {translate('settings.filenameRules.heading')}
      </h2>
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.filenameRules.help')}
      </p>
      {field('template')}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={translate('settings.filenameRules.tokens')}
      >
        {FILENAME_TOKENS.map((token) => (
          <ProductActionButton
            key={token}
            compact
            tone="secondary"
            disabled={disabled}
            onClick={() => {
              const input = inputs.current[activeField];
              const value = draft[activeField] ?? '';
              const start = input?.selectionStart ?? value.length;
              const end = input?.selectionEnd ?? start;
              change(activeField, `${value.slice(0, start)}{${token}}${value.slice(end)}`);
              input?.focus();
            }}
          >
            {translate(`settings.filenameRules.${token}`)}
          </ProductActionButton>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {translate('settings.filenameRules.overrides')}
        </summary>
        <div className="mt-3 space-y-3">{FILENAME_CATEGORIES.map(field)}</div>
      </details>
      <div
        aria-label={translate('settings.filenameRules.preview')}
        className="grid gap-x-5 gap-y-1 text-xs leading-5 sm:grid-cols-2"
      >
        {FILENAME_CATEGORIES.map((category, index) => {
          const result = resolveFilename(
            previewRules,
            {
              category,
              type: category,
              extension: ['png', 'mp4', 'html', 'zip', 'sniptale-settings.json'][index]!,
              index: 1,
            },
            PREVIEW_CONTEXT
          );
          return (
            <div key={category}>
              <span>{translate(`settings.filenameRules.${category}`)}: </span>
              <output className="break-all">{result.filename}</output>
              {result.fallback ? <p>{translate('settings.filenameRules.fallback')}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ProductActionButton
          compact
          tone="primary"
          disabled={disabled || !valid || status === 'saved'}
          onClick={() => void save()}
        >
          {translate('settings.filenameRules.save')}
        </ProductActionButton>
        <ProductActionButton compact tone="secondary" disabled={disabled} onClick={reset}>
          {translate('settings.filenameRules.reset')}
        </ProductActionButton>
        <p role="status" className="text-sm">
          {translate(`settings.filenameRules.${status}`)}
        </p>
      </div>
    </section>
  );
}
