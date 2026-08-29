import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { translate } from '../../../../platform/i18n/popup';

export function ExportPageSourceSwitch(props: {
  mode: 'tabs' | 'urls';
  onChange: (mode: 'tabs' | 'urls') => void;
}) {
  return (
    <div className="pb-2">
      <SegmentedSwitch
        activeId={props.mode}
        ariaLabel={translate('popup.export.pageSourceModeLabel')}
        density="compact"
        options={[
          { id: 'tabs', label: translate('popup.export.pageSourceTabs') },
          { id: 'urls', label: translate('popup.export.pageSourceUrls') },
        ]}
        onChange={props.onChange}
      />
    </div>
  );
}

export function ExportUrlsEditor(props: {
  invalid: string[];
  overflow: number;
  selectedCount: number;
  text: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <textarea
        aria-label={translate('popup.export.urlInputLabel')}
        autoFocus
        className={[
          'min-h-0 flex-1 resize-none rounded-[9px] border bg-transparent p-2.5 text-[11px] leading-5',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
          'text-[var(--sniptale-color-text-primary)] outline-none focus:border-[var(--sniptale-color-accent)]',
        ].join(' ')}
        placeholder={translate('popup.export.urlInputPlaceholder')}
        value={props.text}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
      <div className="flex items-start justify-between gap-2 text-[10px] leading-4">
        <span
          className={
            props.invalid.length
              ? 'text-[var(--sniptale-color-danger)]'
              : 'text-[var(--sniptale-color-text-dim)]'
          }
        >
          {props.overflow > 0
            ? translate('popup.export.urlInputLimit').replace('{{count}}', String(props.overflow))
            : props.invalid.length
              ? translate('popup.export.urlInputInvalid').replace(
                  '{{count}}',
                  String(props.invalid.length)
                )
              : translate('popup.export.urlInputHelp')}
        </span>
        <span className="shrink-0 font-medium text-[var(--sniptale-color-text-secondary)]">
          {props.selectedCount}
        </span>
      </div>
    </div>
  );
}
