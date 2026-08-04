import type {
  CalloutAccentSide,
  CalloutConnectorKind,
  CalloutConnectorMarker,
  CalloutConnectorRouting,
  CalloutLineStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import type { CSSProperties } from 'react';
import {
  ProductGlassIconButton,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';
import { CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import {
  BoundColorField,
  ChoiceField,
  ColorField,
  NumericProperty,
  PropertyField,
  SettingsStack,
  type ManualContentProps,
} from './inspector-fields';

const MARKERS: CalloutConnectorMarker[] = [
  'none',
  'circle',
  'ring-dot',
  'square',
  'diamond',
  'arrow',
];
const LINE_STYLES: CalloutLineStyle[] = ['solid', 'dashed', 'dotted'];

function LineStyleField(props: {
  label: string;
  onChange: (value: CalloutLineStyle) => void;
  value: CalloutLineStyle;
}) {
  return (
    <PropertyField label={props.label}>
      <CompactSelect
        appearance="plain"
        aria-label={props.label}
        options={LINE_STYLES.map((value) => ({
          value,
          label: translate(`content.callout.lineStyle.${value}`),
        }))}
        value={props.value}
        onChange={props.onChange}
      />
    </PropertyField>
  );
}

export function parseCalloutConnectorMarker(value: string): CalloutConnectorMarker | null {
  return MARKERS.find((marker) => marker === value) ?? null;
}

export function CalloutConnectorSettings(props: ManualContentProps) {
  const connector = props.settings.style.connector;
  return (
    <SettingsStack>
      <ChoiceField
        label={translate('content.callout.connectorSection')}
        options={['none', 'wedge', 'line'] as const}
        value={connector.kind}
        getLabel={(kind) => translate(`content.callout.connector.${kind}`)}
        onChange={(kind: CalloutConnectorKind) =>
          props.onChange({ style: { connector: { kind } } })
        }
      />
      {connector.kind === 'wedge' ? (
        <NumericProperty
          label={translate('content.callout.tailSizeLabelPrefix')}
          min={4}
          max={20}
          value={connector.wedgeSize}
          onChange={(wedgeSize) => props.onChange({ style: { connector: { wedgeSize } } })}
        />
      ) : null}
      {connector.kind === 'line' ? <LineConnectorSettings {...props} /> : null}
    </SettingsStack>
  );
}

function LineConnectorSettings(props: ManualContentProps) {
  const connector = props.settings.style.connector;
  const markerOptions = MARKERS.map((value) => ({
    value,
    label: translate(
      value === 'ring-dot' ? 'content.callout.marker.ringDot' : `content.callout.marker.${value}`
    ),
  }));
  return (
    <>
      <PropertyField label={translate('content.callout.routingLabel')}>
        <CompactSelect
          appearance="plain"
          aria-label={translate('content.callout.routingLabel')}
          options={(['straight', 'elbow', 'polyline'] as CalloutConnectorRouting[]).map(
            (value) => ({ value, label: translate(`content.callout.routing.${value}`) })
          )}
          value={connector.routing}
          onChange={(routing) => props.onChange({ style: { connector: { routing } } })}
        />
      </PropertyField>
      <PropertyField label={translate('content.callout.blockMarker')}>
        <CompactSelect
          appearance="plain"
          aria-label={translate('content.callout.blockMarker')}
          options={markerOptions}
          value={connector.blockMarker}
          onChange={(blockMarker) => props.onChange({ style: { connector: { blockMarker } } })}
        />
      </PropertyField>
      {connector.blockMarker !== 'none' ? (
        <NumericProperty
          label={translate('content.callout.blockMarkerSize')}
          min={4}
          max={48}
          value={connector.blockMarkerSize}
          onChange={(blockMarkerSize) =>
            props.onChange({ style: { connector: { blockMarkerSize } } })
          }
        />
      ) : null}
      <PropertyField label={translate('content.callout.frameMarker')}>
        <CompactSelect
          appearance="plain"
          aria-label={translate('content.callout.frameMarker')}
          options={markerOptions}
          value={connector.frameMarker}
          onChange={(frameMarker) => props.onChange({ style: { connector: { frameMarker } } })}
        />
      </PropertyField>
      {connector.frameMarker !== 'none' ? (
        <NumericProperty
          label={translate('content.callout.frameMarkerSize')}
          min={4}
          max={48}
          value={connector.frameMarkerSize}
          onChange={(frameMarkerSize) =>
            props.onChange({ style: { connector: { frameMarkerSize } } })
          }
        />
      ) : null}
      <BoundColorField
        customColor={connector.color}
        frameColors={props.frameColors}
        label={translate('content.callout.connectorColor')}
        palette={CALLOUT_TEXT_PRESETS}
        source={props.settings.style.colorBindings.connector}
        onColorChange={(color) => props.onChange({ style: { connector: { color } } })}
        onSourceChange={(connector) => props.onChange({ style: { colorBindings: { connector } } })}
      />
      <LineStyleField
        label={translate('content.callout.lineStyleLabel')}
        value={connector.lineStyle}
        onChange={(lineStyle) => props.onChange({ style: { connector: { lineStyle } } })}
      />
      <NumericProperty
        label={translate('content.callout.connectorWidthLabel')}
        min={1}
        max={12}
        value={connector.width}
        onChange={(width) => props.onChange({ style: { connector: { width } } })}
      />
    </>
  );
}

export function CalloutBorderSettings(props: ManualContentProps) {
  const surface = props.settings.style.surface;
  return (
    <SettingsStack>
      <BoundColorField
        customColor={surface.borderColor}
        frameColors={props.frameColors}
        label={translate('content.callout.borderColorLabel')}
        palette={CALLOUT_TEXT_PRESETS}
        source={props.settings.style.colorBindings.surfaceBorder}
        onColorChange={(borderColor) => props.onChange({ style: { surface: { borderColor } } })}
        onSourceChange={(surfaceBorder) =>
          props.onChange({ style: { colorBindings: { surfaceBorder } } })
        }
      />
      <LineStyleField
        label={translate('content.callout.lineStyleLabel')}
        value={surface.borderStyle}
        onChange={(borderStyle) => props.onChange({ style: { surface: { borderStyle } } })}
      />
      <NumericProperty
        label={translate('content.callout.borderWidthLabel')}
        min={0}
        max={12}
        value={surface.borderWidth}
        onChange={(borderWidth) => props.onChange({ style: { surface: { borderWidth } } })}
      />
      <NumericProperty
        label={translate('content.callout.radiusLabel')}
        min={0}
        max={48}
        value={surface.radius}
        onChange={(radius) => props.onChange({ style: { surface: { radius } } })}
      />
    </SettingsStack>
  );
}

export function CalloutDividerSettings(props: ManualContentProps) {
  const title = props.settings.style.title;
  return (
    <SettingsStack>
      <ColorField
        label={translate('content.callout.dividerColorLabel')}
        value={title.dividerColor}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(dividerColor) => props.onChange({ style: { title: { dividerColor } } })}
      />
      <LineStyleField
        label={translate('content.callout.lineStyleLabel')}
        value={title.dividerStyle}
        onChange={(dividerStyle) => props.onChange({ style: { title: { dividerStyle } } })}
      />
      <NumericProperty
        label={translate('content.callout.dividerWidthLabel')}
        min={0}
        max={12}
        value={title.dividerWidth}
        onChange={(dividerWidth) => props.onChange({ style: { title: { dividerWidth } } })}
      />
    </SettingsStack>
  );
}

const ACCENT_SIDES: CalloutAccentSide[] = ['top', 'right', 'bottom', 'left'];
const ACCENT_SIDE_ICON_STYLES = {
  top: { borderTopColor: 'currentColor', borderTopWidth: 3 },
  right: { borderRightColor: 'currentColor', borderRightWidth: 3 },
  bottom: { borderBottomColor: 'currentColor', borderBottomWidth: 3 },
  left: { borderLeftColor: 'currentColor', borderLeftWidth: 3 },
} satisfies Record<CalloutAccentSide, CSSProperties>;

function AccentSideField(props: {
  onChange: (side: CalloutAccentSide) => void;
  value: CalloutAccentSide;
}) {
  return (
    <PropertyField label={translate('content.callout.accentSideLabel')}>
      <div className="grid grid-cols-4 justify-items-center gap-1">
        {ACCENT_SIDES.map((side) => {
          const label = translate(`content.callout.accentSide.${side}`);
          return (
            <ProductGlassIconButton
              key={side}
              active={props.value === side}
              aria-label={label}
              data-accent-side={side}
              title={label}
              onClick={() => props.onChange(side)}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-[3px] border border-[var(--sniptale-color-border-soft)]"
                style={ACCENT_SIDE_ICON_STYLES[side]}
              />
            </ProductGlassIconButton>
          );
        })}
      </div>
    </PropertyField>
  );
}

export function CalloutAccentSettings(props: ManualContentProps) {
  const accent = props.settings.style.accentEdge;
  return (
    <SettingsStack>
      <ProductGlassToggleRow
        title={translate('content.callout.accentEnabled')}
        control={
          <ProductGlassSwitch
            aria-label={translate('content.callout.accentEnabled')}
            on={accent.enabled}
            onClick={() => props.onChange({ style: { accentEdge: { enabled: !accent.enabled } } })}
          />
        }
      />
      {accent.enabled ? (
        <>
          <AccentSideField
            value={accent.side}
            onChange={(side) => props.onChange({ style: { accentEdge: { side } } })}
          />
          <BoundColorField
            customColor={accent.color}
            frameColors={props.frameColors}
            label={translate('content.callout.accentColorLabel')}
            palette={CALLOUT_TEXT_PRESETS}
            source={props.settings.style.colorBindings.accent}
            onColorChange={(color) => props.onChange({ style: { accentEdge: { color } } })}
            onSourceChange={(accent) => props.onChange({ style: { colorBindings: { accent } } })}
          />
          <LineStyleField
            label={translate('content.callout.lineStyleLabel')}
            value={accent.lineStyle}
            onChange={(lineStyle) => props.onChange({ style: { accentEdge: { lineStyle } } })}
          />
          <NumericProperty
            label={translate('content.callout.accentWidthLabel')}
            min={1}
            max={12}
            value={accent.width}
            onChange={(width) => props.onChange({ style: { accentEdge: { width } } })}
          />
        </>
      ) : null}
    </SettingsStack>
  );
}
