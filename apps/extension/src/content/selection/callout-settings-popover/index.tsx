import { useRef } from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import type {
  CalloutSettings,
  CalloutVariant,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { dispatchCalloutDelete } from '../../platform/page-context/frame-events';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { CalloutSettingsPopoverContent } from './body';
import { createCalloutVariantOptions, getCalloutSettingsPopoverStyle } from './helpers';
import {
  useCalloutSettingsPopoverDistanceClose,
  useCalloutSettingsPopoverOutsideClose,
} from './sync';
import { useCalloutSettingsPopoverState } from './state';

interface CalloutSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  frameId: string;
  settings?: CalloutSettings;
  anchorEl: HTMLElement | null;
}

export function CalloutSettingsPopover({
  isOpen,
  onClose,
  frameId,
  settings,
  anchorEl,
}: CalloutSettingsPopoverProps) {
  useAppLocale();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { handleSettingChange, isTextOnly, localSettings } = useCalloutSettingsPopoverState({
    frameId,
    isOpen,
    ...(settings === undefined ? {} : { settings }),
  });

  useCalloutSettingsPopoverOutsideClose({ isOpen, onClose, popoverRef });
  useCalloutSettingsPopoverDistanceClose({ isOpen, onClose, popoverRef });

  const handleDelete = () => {
    dispatchCalloutDelete({ frameId });
    onClose();
  };

  const variantOptions: { value: CalloutVariant; label: string }[] = createCalloutVariantOptions();

  return (
    <ContentPopoverAdapter
      isOpen={isOpen}
      anchorEl={anchorEl}
      portalTarget={resolveContentPortalTarget(anchorEl)}
      popoverRef={popoverRef}
      className={[
        'sniptale-callout-settings-popover sniptale-glass-popover',
        'sniptale-glass-popover--wide sniptale-glass-popover-scroll',
      ].join(' ')}
      style={getCalloutSettingsPopoverStyle(anchorEl)}
      dataUi="content.callout-settings.popover"
    >
      <CalloutSettingsPopoverContent
        handleDelete={handleDelete}
        handleSettingChange={handleSettingChange}
        isTextOnly={isTextOnly}
        localSettings={localSettings}
        variantOptions={variantOptions}
      />
    </ContentPopoverAdapter>
  );
}
