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
import { createCalloutVariantOptions, POPOVER_HEIGHT, POPOVER_WIDTH } from './helpers';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import {
  usePopoverDistanceClose as useCalloutSettingsPopoverDistanceClose,
  usePopoverEscapeClose,
  usePopoverOutsideClose as useCalloutSettingsPopoverOutsideClose,
} from '../popover-sync/hooks';
import { useCalloutSettingsPopoverState } from './state';

interface CalloutSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  settings?: CalloutSettings;
  anchorEl: HTMLElement | null;
}

export function CalloutSettingsPopover({
  isOpen,
  onClose,
  frameId,
  frameRect,
  settings,
  anchorEl,
}: CalloutSettingsPopoverProps) {
  useAppLocale();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const popoverStyle = useFramePopoverPosition({
    anchorEl,
    fallbackSize: { width: POPOVER_WIDTH, height: POPOVER_HEIGHT },
    frameId,
    frameRect,
    isOpen,
    popoverRef,
  });
  const { handleSettingChange, isTextOnly, localSettings } = useCalloutSettingsPopoverState({
    frameId,
    isOpen,
    ...(settings === undefined ? {} : { settings }),
  });

  useCalloutSettingsPopoverOutsideClose({ isOpen, onClose, popoverRef });
  useCalloutSettingsPopoverDistanceClose({ isOpen, onClose, popoverRef });
  usePopoverEscapeClose({ anchorEl, isOpen, onClose });

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
        'sniptale-glass-popover--wide sniptale-content-popover--compact',
        'sniptale-content-popover--toolbar-menu',
      ].join(' ')}
      style={popoverStyle}
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
