import type {
  CalloutConnectorKind,
  CalloutConnectorMarker,
  CalloutConnectorRouting,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';
import { CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import {
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
      <ChoiceField
        label={translate('content.callout.routingLabel')}
        options={['straight', 'elbow'] as const}
        value={connector.routing}
        getLabel={(routing) => translate(`content.callout.routing.${routing}`)}
        onChange={(routing: CalloutConnectorRouting) =>
          props.onChange({ style: { connector: { routing } } })
        }
      />
      <PropertyField label={translate('content.callout.blockMarker')}>
        <CompactSelect
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
      <ColorField
        label={translate('content.callout.connectorColor')}
        value={connector.color}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(color) => props.onChange({ style: { connector: { color } } })}
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
      <ColorField
        label={translate('content.callout.borderColorLabel')}
        value={surface.borderColor}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(borderColor) => props.onChange({ style: { surface: { borderColor } } })}
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
