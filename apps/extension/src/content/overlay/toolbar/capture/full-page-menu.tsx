import React, { useCallback, useRef } from 'react';
import {
  ChevronDown,
  EyeOff,
  GalleryVertical,
  ImageDown,
  Pin,
  Repeat2,
  Snowflake,
} from 'lucide-react';
import {
  ProductToolbarMenu,
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
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { PopoverCheckIcon } from '../../icons/icons';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from './dropdown.shared';

type FullPageMenuProps = {
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
        disabled={props.saving}
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

function FullPagePreferencesMenu(
  props: FullPageMenuProps & {
    menuRef: React.RefObject<HTMLDivElement | null>;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }
) {
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: props.triggerRef,
    displayMode: props.displayMode,
    getMenuPosition: (ref, height = 380) => {
      const rect = ref.current?.getBoundingClientRect();
      return rect &&
        window.innerHeight - rect.bottom < height &&
        rect.top > window.innerHeight - rect.bottom
        ? 'up'
        : 'down';
    },
    menuHeight: 380,
    menuWidth: 300,
  });
  if (!style) return null;

  return (
    <ToolbarMenuDropdown dataUi="content.toolbar.full-page-menu" menuRef={props.menuRef}>
      <ProductToolbarMenu
        className="sniptale-full-page-menu"
        compact={props.compactMenus}
        placement={menuPlacement}
        style={style}
        title={translate('content.toolbar.fullPageSettingsTitle')}
        variant="capture"
      >
        <ProductToolbarMenuGroupLabel>
          {translate('content.toolbar.fullPageFloatingTitle')}
        </ProductToolbarMenuGroupLabel>
        <FloatingModeItems {...props} />
        <ProductToolbarMenuDivider />
        <BooleanPreferenceItem
          disabled={props.saving}
          hint={translate('content.toolbar.fullPageLazyContentHint')}
          icon={<ImageDown aria-hidden="true" className="sniptale-popover-icon" />}
          label={translate('content.toolbar.fullPageLazyContent')}
          selected={props.preferences.preloadLazyContent}
          onSelect={() =>
            void props.onUpdate({ preloadLazyContent: !props.preferences.preloadLazyContent })
          }
        />
        <BooleanPreferenceItem
          disabled={props.saving}
          hint={translate('content.toolbar.fullPageFreezeMotionHint')}
          icon={<Snowflake aria-hidden="true" className="sniptale-popover-icon" />}
          label={translate('content.toolbar.fullPageFreezeMotion')}
          selected={props.preferences.freezeMotion}
          onSelect={() => void props.onUpdate({ freezeMotion: !props.preferences.freezeMotion })}
        />
        {props.currentViewport ? (
          <>
            <ProductToolbarMenuDivider />
            <ProductToolbarMenuDetail id="sniptale-full-page-viewport-hint">
              {translate('content.toolbar.fullPageCustomViewportHint')}
            </ProductToolbarMenuDetail>
          </>
        ) : null}
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}

export function FullPageCaptureSplitButton(props: FullPageMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = props.toolbarMenuState.activeMenuType === 'full-page';
  const closeMenu = useCallback(() => {
    props.toolbarMenuState.closeMenu('full-page');
    queueMicrotask(() => triggerRef.current?.focus());
  }, [props.toolbarMenuState]);
  const closeMenuWithoutFocus = useCallback(() => {
    props.toolbarMenuState.closeMenu('full-page');
  }, [props.toolbarMenuState]);

  useToolbarFloatingMenuDismissal({
    closeOnFarPointer: true,
    menuRef,
    onClose: closeMenu,
    onFarPointerClose: closeMenuWithoutFocus,
    open,
    triggerRef,
  });

  return (
    <div className="sniptale-split-action sniptale-full-page-wrapper">
      <button
        className="sniptale-btn sniptale-split-action-start sniptale-full-page-primary"
        data-sniptale-activation-bridge="defer"
        data-ui="content.toolbar.capture-full-button"
        disabled={props.disabled}
        onClick={props.onPrimaryClick}
        title={translate('content.toolbar.fullPage')}
      >
        <GalleryVertical size={20} strokeWidth={2} />
      </button>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        className="sniptale-btn sniptale-split-action-end sniptale-full-page-chevron"
        data-menu-open={open ? 'true' : 'false'}
        data-ui="content.toolbar.capture-full-settings-button"
        disabled={props.disabled}
        onClick={(event) => {
          event.stopPropagation();
          props.toolbarMenuState.toggleMenu('full-page');
        }}
        title={translate('content.toolbar.fullPageSettingsTitle')}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {open ? (
        <FullPagePreferencesMenu {...props} menuRef={menuRef} triggerRef={triggerRef} />
      ) : null}
    </div>
  );
}
