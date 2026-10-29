import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import {
  AppWindow,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  UnfoldVertical,
} from 'lucide-react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuDivider,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import type { ToolbarMenuState } from '../state/menu';
import {
  resolveToolbarDrawingMenuStyle,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarMenuDirection } from '../menu/direction';

function resolveCaptureMenuLayout(
  displayMode: 'horizontal' | 'vertical',
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  full: boolean,
  parametersOpen: boolean,
  compact: boolean
) {
  const menuHeight = parametersOpen ? (full ? 600 : 240) : compact ? (full ? 220 : 180) : 500;
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: triggerRef,
    displayMode,
    getMenuPosition: (ref, height = 440) => {
      const rect = ref.current?.getBoundingClientRect();
      return rect &&
        window.innerHeight - rect.bottom < height &&
        rect.top > window.innerHeight - rect.bottom
        ? 'up'
        : 'down';
    },
    menuHeight,
    menuWidth: 300,
  });
  return {
    placement: menuPlacement,
    style: style
      ? resolveToolbarDrawingMenuStyle({
          anchorEl: triggerRef.current?.parentElement ?? null,
          displayMode,
          menuHeight,
          menuWidth: 300,
          placement: menuPlacement === 'up' ? 'up' : 'down',
        })
      : null,
  };
}

const CAPTURE_MODES = {
  visible: {
    menuType: 'visible-page',
    menuDataUi: 'content.toolbar.visible-page-menu',
    primaryDataUi: 'content.toolbar.capture-visible-button',
    triggerDataUi: 'content.toolbar.capture-visible-settings-button',
    labelKey: 'content.toolbar.visibleArea',
    optionsKey: 'content.toolbar.visiblePageSettingsTitle',
    Icon: AppWindow,
  },
  full: {
    menuType: 'full-page',
    menuDataUi: 'content.toolbar.full-page-menu',
    primaryDataUi: 'content.toolbar.capture-full-button',
    triggerDataUi: 'content.toolbar.capture-full-settings-button',
    labelKey: 'content.toolbar.fullPage',
    optionsKey: 'content.toolbar.fullPageSettingsTitle',
    Icon: UnfoldVertical,
  },
} as const;

function ScreenshotCaptureActions(props: {
  mode: 'visible' | 'full';
  quickActions: ReactNode;
  summary: string | undefined;
  onParameters: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {props.quickActions}
      <ProductToolbarMenuDivider />
      <div ref={props.triggerRef} data-sniptale-activation-bridge="defer">
        <ProductToolbarMenuItem
          dataUi={`content.toolbar.${props.mode}-capture-parameters`}
          onClick={props.onParameters}
        >
          <SlidersHorizontal size={16} aria-hidden />
          <ProductToolbarMenuItemCopy
            label={
              <span
                id={`content.toolbar.${props.mode}-capture-summary`}
                className="whitespace-normal text-[var(--sniptale-color-text-secondary)]"
              >
                {props.summary ?? translate('content.toolbar.captureParameters')}
              </span>
            }
          />
          <ChevronRight size={16} aria-hidden />
        </ProductToolbarMenuItem>
      </div>
    </>
  );
}

export function ScreenshotCaptureSplitButton(props: {
  mode: 'visible' | 'full';
  compactMenus: boolean;
  disabled: boolean;
  displayMode: 'horizontal' | 'vertical';
  toolbarMenuState: ToolbarMenuState;
  onPrimaryClick: MouseEventHandler<HTMLButtonElement>;
  quickActions?: ReactNode;
  summary?: string;
  children: ReactNode;
}) {
  const [parametersOpen, setParametersOpen] = useState(false);
  const full = props.mode === 'full';
  const config = CAPTURE_MODES[props.mode];
  const { menuType, Icon } = config;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const parametersRef = useRef<HTMLDivElement>(null);
  const parametersTriggerRef = useRef<HTMLDivElement>(null);
  const restoreParametersFocus = useRef(false);
  const layout = () =>
    resolveCaptureMenuLayout(
      props.displayMode,
      triggerRef,
      full,
      parametersOpen,
      props.compactMenus
    );
  const menuSide = useToolbarMenuDirection(layout);
  const open = props.toolbarMenuState.activeMenuType === menuType;
  const closeMenu = useCallback(
    () => props.toolbarMenuState.closeMenu(menuType),
    [props.toolbarMenuState, menuType]
  );
  const returnToActions = useCallback(() => {
    restoreParametersFocus.current = true;
    setParametersOpen(false);
  }, []);
  useEffect(() => {
    if (!open) setParametersOpen(false);
  }, [open]);
  useLayoutEffect(() => {
    if (!parametersOpen && open && restoreParametersFocus.current) {
      restoreParametersFocus.current = false;
      const trigger = parametersTriggerRef.current?.querySelector('button');
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    }
    if (parametersOpen && open)
      parametersRef.current
        ?.querySelector<HTMLButtonElement>('button, input')
        ?.focus({ preventScroll: true });
  }, [parametersOpen, open]);
  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: closeMenu,
    open,
    triggerRef,
  });
  const adopted = useContext(CommandPressScope);
  const { placement, style } = layout();
  const label = translate(config.labelKey);
  return (
    <div
      className={[
        'sniptale-split-action sniptale-full-page-wrapper',
        'sniptale-toolbar-split-control sniptale-screenshot-split-control',
      ].join(' ')}
    >
      <ContentToolbarButton
        type="button"
        tone="property"
        data-content-command="true"
        className="sniptale-split-action-start sniptale-full-page-primary"
        data-sniptale-activation-bridge="defer"
        dataUi={config.primaryDataUi}
        disabled={props.disabled}
        onClick={props.onPrimaryClick}
        title={label}
      >
        <Icon size={20} strokeWidth={2} />
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        tone="property"
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        className="sniptale-split-action-end sniptale-full-page-chevron"
        data-menu-open={open ? 'true' : 'false'}
        data-menu-side={menuSide}
        dataUi={config.triggerDataUi}
        disabled={props.disabled}
        onClick={(event) => {
          event.stopPropagation();
          props.toolbarMenuState.toggleMenu(menuType);
        }}
        title={translate(config.optionsKey)}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </ContentToolbarButton>
      {open && style ? (
        <ToolbarMenuDropdown dataUi={config.menuDataUi} menuRef={menuRef}>
          <ProductToolbarMenu
            className={[
              'sniptale-screenshot-menu',
              full ? 'sniptale-full-page-menu' : '',
              adopted ? 'sniptale-content-menu-adopted' : '',
            ].join(' ')}
            compact={props.compactMenus}
            placement={placement}
            style={style}
            title={parametersOpen ? undefined : label}
            variant="capture"
          >
            {parametersOpen ? (
              <>
                <div data-sniptale-activation-bridge="defer">
                  <ProductToolbarMenuItem
                    dataUi={`content.toolbar.${props.mode}-capture-parameters-back`}
                    onClick={returnToActions}
                  >
                    <ArrowLeft size={16} aria-hidden />
                    <ProductToolbarMenuItemCopy label={label} />
                  </ProductToolbarMenuItem>
                </div>
                <ProductToolbarMenuDivider />
                <div
                  ref={parametersRef}
                  data-ui={`content.toolbar.${props.mode}-capture-parameters-panel`}
                >
                  {props.children}
                </div>
              </>
            ) : (
              <ScreenshotCaptureActions
                mode={props.mode}
                quickActions={props.quickActions}
                summary={props.summary}
                onParameters={() => setParametersOpen(true)}
                triggerRef={parametersTriggerRef}
              />
            )}
          </ProductToolbarMenu>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}
