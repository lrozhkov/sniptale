import { Fragment, useState, type CSSProperties, type MouseEvent } from 'react';
import { Scaling } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuDivider,
  ProductToolbarMenuDetail,
  ProductToolbarMenuGroupCopy,
  ProductToolbarMenuGroupLabel,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
  ProductToolbarMenuItemMeta,
} from '@sniptale/ui/product-menus/toolbar';
import { translate, useAppLocale, type AppLocale } from '../../../platform/i18n';
import type { ViewportPreset } from '../../../contracts/settings';
import type { ProductToolbarMenuPlacement } from '@sniptale/ui/product-menus/toolbar';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { getViewportPresetDisplayName } from '../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../features/viewport-presets/format';
import { PopoverCheckIcon } from '../icons/icons';
import { getViewportPresetErrorMessage } from '../../../features/viewport-presets/error-message';
import { groupViewportPresetsForSelector } from '../../../features/viewport-presets/operations';
import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';

const AVAILABILITY_STATUS_DELAY_MS = 400;

type CurrentViewport = {
  presetId?: string;
  target?: 'viewport' | 'window';
  width: number;
  height: number;
} | null;

function ViewportIcon() {
  return <Scaling size={18} strokeWidth={2} />;
}

export function ViewportSelectorButton(props: {
  currentViewport: CurrentViewport;
  disabled: boolean;
  isOpen: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isNative = props.currentViewport === null;
  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onToggle}
      disabled={props.disabled}
      active={!isNative}
      className="sniptale-viewport-btn"
      dataUi="content.toolbar.viewport-button"
      menuIndicator
      title={translate('content.toolbar.viewportButton')}
      data-menu-open={props.isOpen ? 'true' : 'false'}
    >
      {props.currentViewport ? (
        <span className="sniptale-viewport-badge">
          <span>{props.currentViewport.width}</span>
          <span>{props.currentViewport.height}</span>
        </span>
      ) : (
        <ViewportIcon />
      )}
    </ContentToolbarButton>
  );
}

function stopMenuEvent(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

function availabilityDetail(
  preset: ViewportPreset,
  availability: ViewportPresetAvailabilityPayload | undefined,
  locale: AppLocale
): string | null {
  if (!preset.enabled) return translate('viewportPresets.messages.presetDisabled');
  if (!availability) return null;
  if (availability.status === 'available') return null;
  if (availability.status === 'requires-start-validation') {
    return translate('viewportPresets.availability.pendingVideo');
  }
  const reason =
    getViewportPresetErrorMessage(availability.reason) ??
    translate('viewportPresets.availability.unavailable');
  if (!availability.available) return reason;
  const available = formatViewportPresetDimensions(
    availability.available.width,
    availability.available.height,
    locale
  );
  return `${reason} ${translate('viewportPresets.availability.availableSize')}: ${available}.`;
}

function ViewportMenuItem(props: {
  ariaDescribedBy?: string;
  ariaDisabled?: boolean;
  label: string;
  meta?: string;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onHighlight?: () => void;
  selected: boolean;
}) {
  return (
    <ProductToolbarMenuItem
      {...(props.ariaDescribedBy === undefined ? {} : { ariaDescribedBy: props.ariaDescribedBy })}
      {...(props.ariaDisabled === undefined ? {} : { ariaDisabled: props.ariaDisabled })}
      {...(props.onHighlight === undefined
        ? {}
        : { onFocus: props.onHighlight, onMouseEnter: props.onHighlight })}
      onMouseDown={stopMenuEvent}
      onClick={(event) => {
        stopMenuEvent(event);
        if (!props.ariaDisabled) props.onActivate(event);
      }}
      selected={props.selected}
    >
      <ProductToolbarMenuItemCopy label={props.label} />
      {props.meta ? <ProductToolbarMenuItemMeta>{props.meta}</ProductToolbarMenuItemMeta> : null}
      {props.selected ? <PopoverCheckIcon /> : null}
    </ProductToolbarMenuItem>
  );
}

function ViewportPresetMenuItem(props: {
  availability?: ViewportPresetAvailabilityPayload;
  currentViewport: CurrentViewport;
  detailId: string;
  onHighlightDetail: (detail: string | null) => void;
  onSelectPreset: (preset: ViewportPreset, event: MouseEvent<HTMLButtonElement>) => void;
  preset: ViewportPreset;
}) {
  const locale = useAppLocale();
  const unavailable =
    !props.preset.enabled ||
    props.availability === undefined ||
    props.availability.status === 'unavailable';
  const size = formatViewportPresetDimensions(props.preset.width, props.preset.height, locale);
  const detail = availabilityDetail(props.preset, props.availability, locale);
  return (
    <ViewportMenuItem
      {...(detail === null ? {} : { ariaDescribedBy: props.detailId })}
      ariaDisabled={unavailable}
      label={getViewportPresetDisplayName(props.preset, locale)}
      meta={size}
      onHighlight={() => props.onHighlightDetail(detail)}
      onActivate={(event) => props.onSelectPreset(props.preset, event)}
      selected={props.currentViewport?.presetId === props.preset.id}
    />
  );
}

function PresetGroup(props: {
  availabilityById: ReadonlyMap<string, ViewportPresetAvailabilityPayload>;
  currentViewport: CurrentViewport;
  detailId: string;
  label: string;
  onSelectPreset: (preset: ViewportPreset, event: MouseEvent<HTMLButtonElement>) => void;
  onHighlightDetail: (detail: string | null) => void;
  presets: ViewportPreset[];
  target: ViewportPreset['target'];
}) {
  if (props.presets.length === 0) return null;
  return (
    <>
      <ProductToolbarMenuGroupLabel>
        <ProductToolbarMenuGroupCopy
          label={props.label}
          hint={translate(`viewportPresets.hints.${props.target}`)}
        />
      </ProductToolbarMenuGroupLabel>
      {props.presets.map((preset) => (
        <ViewportPresetMenuItem
          key={preset.id}
          {...(props.availabilityById.get(preset.id) === undefined
            ? {}
            : { availability: props.availabilityById.get(preset.id)! })}
          currentViewport={props.currentViewport}
          detailId={props.detailId}
          onHighlightDetail={props.onHighlightDetail}
          onSelectPreset={props.onSelectPreset}
          preset={preset}
        />
      ))}
    </>
  );
}

export function ViewportSelectorMenu(props: {
  availabilityById: ReadonlyMap<string, ViewportPresetAvailabilityPayload>;
  compactMenus: boolean;
  currentViewport: CurrentViewport;
  menuPlacement: ProductToolbarMenuPlacement;
  menuStyle: CSSProperties;
  onSelectNative: (event: MouseEvent<HTMLButtonElement>) => void;
  onSelectPreset: (preset: ViewportPreset, event: MouseEvent<HTMLButtonElement>) => void;
  presets: ViewportPreset[];
}) {
  const locale = useAppLocale();
  const [highlightedDetail, setHighlightedDetail] = useState<string | null | undefined>(undefined);
  const presetGroups = groupViewportPresetsForSelector(props.presets);
  const detailId = 'sniptale-viewport-menu-detail';
  const checkingAvailability = props.presets.some(
    (preset) => !props.availabilityById.has(preset.id)
  );
  const firstUnavailableDetail = props.presets
    .map((preset) => availabilityDetail(preset, props.availabilityById.get(preset.id), locale))
    .find((detail): detail is string => detail !== null);
  const visibleDetail =
    highlightedDetail === undefined ? (firstUnavailableDetail ?? null) : highlightedDetail;
  return (
    <ProductToolbarMenu
      compact={props.compactMenus}
      style={props.menuStyle}
      title={translate('content.toolbar.viewportMenuTitle')}
      variant="viewport"
      placement={props.menuPlacement}
    >
      {checkingAvailability ? (
        <DelayedLoadingFallback
          delayMs={AVAILABILITY_STATUS_DELAY_MS}
          fallback={
            <ProductToolbarMenuDetail id="sniptale-viewport-menu-status">
              {translate('viewportPresets.availability.checking')}
            </ProductToolbarMenuDetail>
          }
        />
      ) : null}
      {visibleDetail ? (
        <ProductToolbarMenuDetail id={detailId}>{visibleDetail}</ProductToolbarMenuDetail>
      ) : null}
      <ViewportMenuItem
        label={translate('content.toolbar.viewportNativeLabel')}
        onHighlight={() => setHighlightedDetail(null)}
        onActivate={props.onSelectNative}
        selected={props.currentViewport === null}
      />
      {props.presets.length > 0 ? <ProductToolbarMenuDivider /> : null}
      {presetGroups.map((group, index) => (
        <Fragment key={group.target}>
          {index > 0 ? <ProductToolbarMenuDivider /> : null}
          <PresetGroup
            availabilityById={props.availabilityById}
            currentViewport={props.currentViewport}
            label={translate(`viewportPresets.groups.${group.target}`)}
            detailId={detailId}
            onHighlightDetail={setHighlightedDetail}
            onSelectPreset={props.onSelectPreset}
            presets={group.presets}
            target={group.target}
          />
        </Fragment>
      ))}
    </ProductToolbarMenu>
  );
}
