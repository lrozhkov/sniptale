import { Library, Package } from 'lucide-react';
import { useState } from 'react';

import { translate } from '../../../../platform/i18n/popup';
import { PopupExpandingModeButton } from '../../../../ui/popup-shell/expanding-mode-button';

export type PopupPackageDestination = 'export' | 'save';

export function PackageDestinationSwitch(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  onChange: (destination: PopupPackageDestination) => void;
}) {
  const [animate, setAnimate] = useState(false);
  return (
    <div className="flex gap-1.5" aria-label={translate('popup.export.packageDestinationLabel')}>
      {(['export', 'save'] as const).map((destination) => {
        const active = props.destination === destination;
        const Icon = destination === 'export' ? Package : Library;
        const label = translate(
          destination === 'export'
            ? 'popup.export.packageDestinationDownload'
            : 'popup.export.packageDestinationLibrary'
        );
        const description = translate(
          destination === 'export'
            ? 'popup.export.packageDestinationDownloadDescription'
            : 'popup.export.packageDestinationLibraryDescription'
        );
        return (
          <PopupExpandingModeButton
            key={destination}
            accentClassName="text-[var(--sniptale-color-accent)]"
            active={active}
            animate={animate}
            description={description}
            disabled={props.disabled}
            icon={Icon}
            label={label}
            onClick={() => {
              if (!active && !props.disabled) {
                setAnimate(true);
                props.onChange(destination);
              }
            }}
          />
        );
      })}
    </div>
  );
}
