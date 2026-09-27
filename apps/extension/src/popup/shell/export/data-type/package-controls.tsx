import { FileCode, Library, Package } from 'lucide-react';

import { translate } from '../../../../platform/i18n/popup';

export type PopupPackageDestination = 'export' | 'save' | 'html';

export function PackageDestinationSwitch(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  onChange: (destination: PopupPackageDestination) => void;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1.5"
      aria-label={translate('popup.export.packageDestinationLabel')}
    >
      {(['export', 'save', 'html'] as const).map((destination) => {
        const active = props.destination === destination;
        const Icon =
          destination === 'export' ? Package : destination === 'html' ? FileCode : Library;
        const label = translate(
          destination === 'export'
            ? 'popup.export.packageDestinationDownload'
            : destination === 'html'
              ? 'popup.export.packageDestinationHtml'
              : 'popup.export.packageDestinationLibrary'
        );
        const description = translate(
          destination === 'export'
            ? 'popup.export.packageDestinationDownloadDescription'
            : destination === 'html'
              ? 'popup.export.packageDestinationHtmlDescription'
              : 'popup.export.packageDestinationLibraryDescription'
        );
        return (
          <button
            type="button"
            key={destination}
            aria-pressed={active}
            title={description}
            disabled={props.disabled}
            className={[
              'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2',
              'text-center text-[11px] leading-4 transition-colors motion-reduce:transition-none',
              'focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-[var(--sniptale-color-accent)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-text-primary)]'
                : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
            ].join(' ')}
            onClick={() => {
              if (!active && !props.disabled) props.onChange(destination);
            }}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
