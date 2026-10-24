import { ArrowLeft, Check, ChevronRight, Crop, PanelTop, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import {
  ProductToolbarMenu,
  ProductToolbarMenuDivider,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n';
import { isTrustedDomEvent } from '../../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import type { ToolbarVideoRecordingProps } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { useToolbarMenuDirection } from '../menu/direction';
import { RecordingOutputSettings } from './output-settings';
import { getToolbarOutputSummary, getToolbarQualityOptions } from './quality-options';

type SetupMenuProps = {
  displayMode: 'horizontal' | 'vertical';
  recording: ToolbarVideoRecordingProps;
  toolbarMenuState: ToolbarMenuState;
};

function useSetupMenu(
  props: SetupMenuProps,
  menuType: 'recording-quality' | 'recording-target',
  menuHeight: number
) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { closeMenu, toggleMenu, activeMenuType } = props.toolbarMenuState;
  const open = activeMenuType === menuType;
  const close = useCallback(() => closeMenu(menuType), [closeMenu, menuType]);
  useEffect(() => close, [close]);
  useToolbarFloatingMenuDismissal({ menuRef, triggerRef, open, onClose: close });
  const resolveLayout = () => {
    const dropdown = resolveToolbarDropdownState({
      anchorRef: triggerRef,
      displayMode: props.displayMode,
      getMenuPosition: (ref, height = menuHeight) => getToolbarMenuPosition(ref.current, height),
      menuHeight,
      menuWidth: menuType === 'recording-quality' ? 320 : 280,
      preferredAlign: 'end',
    });
    return {
      placement: dropdown.menuPlacement,
      style: {
        ...dropdown.style,
        width: menuType === 'recording-quality' ? 320 : 280,
        maxWidth: 'calc(100vw - 16px)',
      },
    };
  };
  const dropdown = resolveLayout();
  const menuSide = useToolbarMenuDirection(resolveLayout);
  return {
    triggerRef,
    menuRef,
    open,
    close,
    dropdown,
    menuSide,
    toggle: () => toggleMenu(menuType),
  };
}

function useQualityMenu(props: SetupMenuProps) {
  const [details, setDetails] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);
  const detailTriggerRef = useRef<HTMLDivElement>(null);
  const menu = useSetupMenu(props, 'recording-quality', details ? 340 : 400);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!menu.open) setDetails(false);
  }, [menu.open]);
  useLayoutEffect(() => {
    if (details && menu.open) {
      menu.menuRef.current
        ?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')
        ?.focus({ preventScroll: true });
    }
  }, [details, menu.open, menu.menuRef]);
  const busy = pending || props.recording.setupPending === true;
  const change = async (operation: () => Promise<void> | void, closeAfter: boolean) => {
    if (pendingRef.current || busy) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await operation();
      if (mountedRef.current && closeAfter) menu.close();
    } catch {
      if (mountedRef.current)
        showToast(translate('content.toolbar.videoRecordingActionFailed'), 'error');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  };
  return { menu, details, setDetails, detailTriggerRef, busy, change };
}

function RecordingQualityProfileList(props: {
  options: ReturnType<typeof getToolbarQualityOptions>;
  currentSummary: string;
  busy: boolean;
  detailsDisabled: boolean;
  detailTriggerRef: RefObject<HTMLDivElement | null>;
  onDetails(): void;
  onSelect(profileId: string): void;
}) {
  return (
    <>
      {!props.options.some((profile) => profile.selected) ? (
        <ProductToolbarMenuItem
          selected
          ariaPressed
          dataUi="content.toolbar.video-recording.quality.custom"
          onClick={props.onDetails}
        >
          <ProductToolbarMenuItemCopy
            label={translate('popup.video.profileCustom')}
            hint={props.currentSummary}
          />
          <Check size={16} aria-hidden className="text-[var(--sniptale-color-accent)]" />
        </ProductToolbarMenuItem>
      ) : null}
      {props.options.map((profile) => (
        <ProductToolbarMenuItem
          key={profile.id}
          dataUi={`content.toolbar.video-recording.quality.profile.${profile.id}`}
          disabled={props.busy || profile.disabled}
          selected={profile.selected}
          ariaPressed={profile.selected}
          onClick={() => props.onSelect(profile.id)}
        >
          <ProductToolbarMenuItemCopy
            showHintInCompact
            label={<span className="block whitespace-normal break-words">{profile.label}</span>}
            hint={profile.summary}
          />
          {profile.selected ? (
            <Check size={16} aria-hidden className="text-[var(--sniptale-color-accent)]" />
          ) : null}
        </ProductToolbarMenuItem>
      ))}
      <ProductToolbarMenuDivider />
      <div ref={props.detailTriggerRef} tabIndex={-1}>
        <ProductToolbarMenuItem
          dataUi="content.toolbar.video-recording.quality.details"
          disabled={props.busy || props.detailsDisabled}
          onClick={props.onDetails}
        >
          <ProductToolbarMenuItemCopy label={translate('popup.video.outputSettingsAction')} />
          <ChevronRight size={16} aria-hidden />
        </ProductToolbarMenuItem>
      </div>
    </>
  );
}

function RecordingQualityMenu(props: SetupMenuProps) {
  const control = useQualityMenu(props);
  const { menu, details, setDetails, detailTriggerRef, busy } = control;
  const settings = props.recording.state.outputSettings;
  const options = settings ? getToolbarQualityOptions(settings) : [];
  const label =
    options.find((profile) => profile.selected)?.label ?? translate('popup.video.profileCustom');
  const title = settings
    ? `${translate('popup.video.qualityLabel')}: ${label} · ${getToolbarOutputSummary(settings.outputProfile)}`
    : translate('popup.video.qualityLabel');
  return (
    <div className="relative flex" aria-busy={busy}>
      <ContentToolbarButton
        ref={menu.triggerRef}
        tone="property"
        menuIndicator
        dataUi="content.toolbar.video-recording.quality.menu"
        title={title}
        disabled={!settings || !props.recording.onQualityProfileChange}
        aria-expanded={menu.open}
        aria-haspopup="dialog"
        data-menu-side={menu.menuSide}
        onClick={menu.toggle}
      >
        <SlidersHorizontal size={18} />
      </ContentToolbarButton>
      {menu.open && settings ? (
        <ToolbarMenuDropdown
          menuRef={menu.menuRef}
          dataUi="content.toolbar.video-recording.quality.dropdown"
        >
          <div role="dialog" aria-label={translate('content.toolbar.videoRecordingSetup')}>
            <ProductToolbarMenu
              className="sniptale-content-menu-adopted"
              compact
              variant="viewport"
              placement={menu.dropdown.placement}
              style={menu.dropdown.style}
            >
              {details ? (
                <>
                  <ProductToolbarMenuItem
                    dataUi="content.toolbar.video-recording.quality.back"
                    onClick={() => {
                      setDetails(false);
                      queueMicrotask(() =>
                        detailTriggerRef.current
                          ?.querySelector('button')
                          ?.focus({ preventScroll: true })
                      );
                    }}
                  >
                    <ArrowLeft size={16} aria-hidden />
                    <ProductToolbarMenuItemCopy
                      label={translate('content.toolbar.videoRecordingQualityProfiles')}
                    />
                  </ProductToolbarMenuItem>
                  <RecordingOutputSettings
                    profile={settings.outputProfile}
                    pending={busy}
                    onChange={(profile) =>
                      void control.change(
                        () => props.recording.onOutputProfileChange?.(profile),
                        false
                      )
                    }
                  />
                </>
              ) : (
                <RecordingQualityProfileList
                  options={options}
                  currentSummary={getToolbarOutputSummary(settings.outputProfile)}
                  busy={busy}
                  detailsDisabled={!props.recording.onOutputProfileChange}
                  detailTriggerRef={detailTriggerRef}
                  onDetails={() => setDetails(true)}
                  onSelect={(profileId) =>
                    void control.change(
                      () => props.recording.onQualityProfileChange?.(profileId),
                      true
                    )
                  }
                />
              )}
            </ProductToolbarMenu>
          </div>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}

function RecordingTargetMenu(props: SetupMenuProps) {
  const menu = useSetupMenu(props, 'recording-target', 130);
  const mode = props.recording.captureMode ?? CaptureMode.TAB;
  const label = translate(
    mode === CaptureMode.TAB_CROP
      ? 'content.toolbar.videoRecordingTargetArea'
      : 'content.toolbar.videoRecordingTargetTab'
  );
  return (
    <div className="relative flex">
      <ContentToolbarButton
        ref={menu.triggerRef}
        tone="property"
        menuIndicator
        dataUi="content.toolbar.video-recording.capture-target.menu"
        title={`${translate('content.toolbar.videoRecordingTarget')}: ${label}`}
        aria-expanded={menu.open}
        aria-haspopup="dialog"
        data-menu-side={menu.menuSide}
        disabled={!props.recording.onCaptureModeChange || props.recording.setupPending}
        onClick={menu.toggle}
      >
        {mode === CaptureMode.TAB_CROP ? <Crop size={18} /> : <PanelTop size={18} />}
      </ContentToolbarButton>
      {menu.open ? (
        <ToolbarMenuDropdown
          menuRef={menu.menuRef}
          dataUi="content.toolbar.video-recording.capture-target.dropdown"
        >
          <div role="dialog" aria-label={translate('content.toolbar.videoRecordingSetup')}>
            <ProductToolbarMenu
              className="sniptale-content-menu-adopted"
              compact
              variant="viewport"
              placement={menu.dropdown.placement}
              style={menu.dropdown.style}
            >
              <div
                className="px-1 py-1"
                onClickCapture={(event) => {
                  if (
                    !isTrustedDomEvent(event.nativeEvent) &&
                    !isBridgedMouseEvent(event.nativeEvent)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                <SegmentedSwitch
                  activeId={mode}
                  appearance="neutral"
                  density="compact"
                  ariaLabel={translate('content.toolbar.videoRecordingTarget')}
                  dataAttribute={{ 'data-ui': 'content.toolbar.video-recording.capture-target' }}
                  options={[
                    {
                      id: CaptureMode.TAB,
                      label: translate('content.toolbar.videoRecordingTargetTab'),
                    },
                    {
                      id: CaptureMode.TAB_CROP,
                      label: translate('content.toolbar.videoRecordingTargetArea'),
                    },
                  ]}
                  onChange={(value) => props.recording.onCaptureModeChange?.(value)}
                />
                {mode === CaptureMode.TAB_CROP ? (
                  <p className="px-1 pt-2 text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
                    {translate('content.toolbar.videoRecordingTargetAreaHint')}
                  </p>
                ) : null}
              </div>
            </ProductToolbarMenu>
          </div>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}

export function RecordingSetupControls(props: SetupMenuProps) {
  return (
    <ContentToolbarGroup
      dataUi="content.toolbar.video-recording.setup-group"
      aria-label={translate('content.toolbar.videoRecordingSetup')}
    >
      <RecordingQualityMenu {...props} />
      <RecordingTargetMenu {...props} />
    </ContentToolbarGroup>
  );
}
