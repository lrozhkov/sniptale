import type React from 'react';
import { ScreenshotCaptureSplitButton } from './screenshot-menu';
import { EyeOff, ImageDown, Pin, Repeat2, Snowflake } from 'lucide-react';
import {
  ProductToolbarMenuDetail,
  ProductToolbarMenuDivider,
  ProductToolbarMenuGroupLabel,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import type {
  FullPageCapturePreferences,
  FullPageFloatingElementsMode,
} from '../../../../contracts/full-page-capture';
import type { ToolbarMenuState } from '../state/menu';
import { PopoverCheckIcon } from '../../icons/icons';

type FullPageMenuProps = {
  quickActions?: React.ReactNode;
  imageParameters?: React.ReactNode;
  compactMenus: boolean;
  currentViewport: { height: number; width: number } | null;
  disabled: boolean;
  displayMode: 'horizontal' | 'vertical';
  onPrimaryClick: React.MouseEventHandler<HTMLButtonElement>;
  onUpdate: (patch: Partial<FullPageCapturePreferences>) => Promise<void>;
  preferences: FullPageCapturePreferences;
  saving: boolean;
  toolbarMenuState: ToolbarMenuState;
};

const FLOATING_OPTIONS: Array<{
  hintKey: 'fullPageFloatingHideHint' | 'fullPageFloatingOnceHint' | 'fullPageFloatingRepeatHint';
  translationKey: 'fullPageFloatingHide' | 'fullPageFloatingOnce' | 'fullPageFloatingRepeat';
  value: FullPageFloatingElementsMode;
}> = [
  {
    hintKey: 'fullPageFloatingOnceHint',
    translationKey: 'fullPageFloatingOnce',
    value: 'once',
  },
  {
    hintKey: 'fullPageFloatingHideHint',
    translationKey: 'fullPageFloatingHide',
    value: 'hide',
  },
  {
    hintKey: 'fullPageFloatingRepeatHint',
    translationKey: 'fullPageFloatingRepeat',
    value: 'repeat',
  },
];

const FLOATING_ICONS = {
  hide: EyeOff,
  once: Pin,
  repeat: Repeat2,
} as const;

function stopMenuEvent(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function FloatingModeItems(props: Pick<FullPageMenuProps, 'onUpdate' | 'preferences' | 'saving'>) {
  return FLOATING_OPTIONS.map((option) => {
    const selected = props.preferences.floatingElements === option.value;
    const Icon = FLOATING_ICONS[option.value];
    return (
      <ProductToolbarMenuItem
        key={option.value}
        dataUi={`content.toolbar.full-page-floating.${option.value}`}
        selected={selected}
        onClick={(event) => {
          stopMenuEvent(event);
          void props.onUpdate({ floatingElements: option.value });
        }}
        onMouseDown={stopMenuEvent}
      >
        <Icon aria-hidden="true" className="sniptale-popover-icon" />
        <ProductToolbarMenuItemCopy
          hint={translate(`content.toolbar.${option.hintKey}`)}
          label={translate(`content.toolbar.${option.translationKey}`)}
        />
        {selected ? <PopoverCheckIcon /> : null}
      </ProductToolbarMenuItem>
    );
  });
}

function BooleanPreferenceItem(props: {
  disabled: boolean;
  icon: React.ReactNode;
  hint: string;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <ProductToolbarMenuItem
      disabled={props.disabled}
      selected={props.selected}
      onClick={(event) => {
        stopMenuEvent(event);
        props.onSelect();
      }}
      onMouseDown={stopMenuEvent}
    >
      {props.icon}
      <ProductToolbarMenuItemCopy hint={props.hint} label={props.label} />
      {props.selected ? <PopoverCheckIcon /> : null}
    </ProductToolbarMenuItem>
  );
}

export function FullPageCaptureSplitButton(props: FullPageMenuProps) {
  return (
    <ScreenshotCaptureSplitButton
      compactMenus={props.compactMenus}
      disabled={props.disabled}
      displayMode={props.displayMode}
      mode="full"
      onPrimaryClick={props.onPrimaryClick}
      toolbarMenuState={props.toolbarMenuState}
      quickActions={props.quickActions}
    >
      {props.imageParameters}
      <BooleanPreferenceItem
        disabled={false}
        hint={translate('content.toolbar.fullPageLazyContentHint')}
        icon={<ImageDown aria-hidden="true" className="sniptale-popover-icon" />}
        label={translate('content.toolbar.fullPageLazyContent')}
        selected={props.preferences.preloadLazyContent}
        onSelect={() =>
          void props.onUpdate({ preloadLazyContent: !props.preferences.preloadLazyContent })
        }
      />
      <BooleanPreferenceItem
        disabled={false}
        hint={translate('content.toolbar.fullPageFreezeMotionHint')}
        icon={<Snowflake aria-hidden="true" className="sniptale-popover-icon" />}
        label={translate('content.toolbar.fullPageFreezeMotion')}
        selected={props.preferences.freezeMotion}
        onSelect={() => void props.onUpdate({ freezeMotion: !props.preferences.freezeMotion })}
      />
      <ProductToolbarMenuDivider />
      <ProductToolbarMenuGroupLabel>
        {translate('content.toolbar.fullPageFloatingTitle')}
      </ProductToolbarMenuGroupLabel>
      <FloatingModeItems {...props} />
      {props.currentViewport ? (
        <>
          <ProductToolbarMenuDivider />
          <ProductToolbarMenuDetail id="sniptale-full-page-viewport-hint">
            {translate('content.toolbar.fullPageCustomViewportHint')}
          </ProductToolbarMenuDetail>
        </>
      ) : null}
    </ScreenshotCaptureSplitButton>
  );
}
