import { FileCode, Library, Package } from 'lucide-react';
import { useState } from 'react';

import { translate } from '../../../../platform/i18n/popup';
import { PopupExpandingModeButton } from '../../../../ui/popup-shell/expanding-mode-button';

export type PopupPackageDestination = 'export' | 'save' | 'html';

const destinations = [
  {
    value: 'export',
    icon: Package,
    label: 'popup.export.packageDestinationDownload',
    description: 'popup.export.packageDestinationDownloadShortDescription',
  },
  {
    value: 'save',
    icon: Library,
    label: 'popup.export.packageDestinationLibrary',
    description: 'popup.export.packageDestinationLibraryShortDescription',
  },
  {
    value: 'html',
    icon: FileCode,
    label: 'popup.export.packageDestinationHtml',
    description: 'popup.export.packageDestinationHtmlShortDescription',
  },
] as const;

export function PackageDestinationSwitch(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  onChange: (destination: PopupPackageDestination) => void;
}) {
  const [animate, setAnimate] = useState(false);
  return (
    <div
      className="flex min-w-0 gap-1.5"
      aria-label={translate('popup.export.packageDestinationLabel')}
    >
      {destinations.map(({ value, icon, label, description }) => (
        <PopupExpandingModeButton
          key={value}
          accentClassName="text-[var(--sniptale-color-accent)]"
          active={props.destination === value}
          animate={animate}
          compact
          description={translate(description)}
          disabled={props.disabled}
          icon={icon}
          label={translate(label)}
          onClick={() => {
            if (props.destination === value || props.disabled) return;
            setAnimate(true);
            props.onChange(value);
          }}
        />
      ))}
    </div>
  );
}
