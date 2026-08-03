import type {
  CalloutAnchor,
  CalloutConnectorKind,
  CalloutConnectorMarker,
  CalloutPreset,
  CalloutSettings,
  CalloutSide,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassDestructiveButton,
  ProductGlassInput,
  ProductGlassMiniButton,
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetName,
  ProductGlassRow,
} from '@sniptale/ui/product-glass-controls';
import { useState } from 'react';
import { CompactColorSelector } from '../../../ui/color-selector';
import { translate, useAppLocale } from '../../../platform/i18n';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { CALLOUT_BACKGROUND_PRESETS, CALLOUT_TEXT_PRESETS } from '../callout/constants';
import type { CalloutSettingsPatch } from '../callout/model';
import { ANCHOR_GRID } from './anchor-grid';
import { CalloutSettingsPositionGrid } from './position-grid';
import { CalloutRangeControl } from './range-control';

const MARKERS: CalloutConnectorMarker[] = ['none', 'circle', 'square', 'diamond', 'arrow'];

export function parseCalloutConnectorMarker(value: string): CalloutConnectorMarker | null {
  return MARKERS.find((marker) => marker === value) ?? null;
}

export function CalloutPresetSection(props: {
  activePresetId?: string;
  onApplyPreset: (preset: CalloutPreset) => void;
  onEditPreset: (preset: CalloutPreset) => void;
  onSavePreset: (name: string) => void;
  onTogglePreset: (preset: CalloutPreset) => void;
  presets: CalloutPreset[];
  error: string | null;
}) {
  const locale = useAppLocale();
  const [name, setName] = useState('');
  const activePreset = props.presets.find((preset) => preset.id === props.activePresetId);
  return (
    <ContentPopoverSection
      title={translate('content.callout.presetsSection')}
      dataUi="content.callout-settings.presets-section"
    >
      <ProductGlassPresetList scrollable>
        {props.presets.map((preset) => (
          <ProductGlassPresetItem
            key={preset.id}
            active={props.activePresetId === preset.id}
            disabled={preset.enabled === false}
            onClick={() => props.onApplyPreset(preset)}
          >
            <ProductGlassPresetName>
              {getCalloutPresetDisplayName(preset, locale)}
            </ProductGlassPresetName>
          </ProductGlassPresetItem>
        ))}
      </ProductGlassPresetList>
      {activePreset ? (
        <ProductGlassRow>
          <ProductGlassMiniButton onClick={() => props.onEditPreset(activePreset)}>
            {translate('content.callout.updatePreset')}
          </ProductGlassMiniButton>
          <ProductGlassMiniButton onClick={() => props.onTogglePreset(activePreset)}>
            {activePreset.enabled === false
              ? translate('content.callout.enablePreset')
              : translate('content.callout.disablePreset')}
          </ProductGlassMiniButton>
        </ProductGlassRow>
      ) : null}
      <ProductGlassInput
        aria-label={translate('content.callout.presetNameLabel')}
        placeholder={translate('content.callout.presetNameLabel')}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <ProductGlassMiniButton disabled={!name.trim()} onClick={() => props.onSavePreset(name)}>
        {translate('content.callout.savePreset')}
      </ProductGlassMiniButton>
      {props.error ? <div role="alert">{props.error}</div> : null}
    </ContentPopoverSection>
  );
}

export function CalloutPositionSection(props: {
  anchor: CalloutAnchor;
  onAnchorChange: (anchor: CalloutAnchor) => void;
  onSideChange: (side: CalloutSide) => void;
  side: CalloutSide;
}) {
  return (
    <ContentPopoverSection title={translate('content.callout.positionSection')}>
      <CalloutSettingsPositionGrid
        anchorGrid={ANCHOR_GRID}
        anchor={props.anchor}
        onAnchorChange={props.onAnchorChange}
        onSideChange={props.onSideChange}
        side={props.side}
      />
    </ContentPopoverSection>
  );
}

export function CalloutAppearanceSection(props: {
  onChange: (patch: CalloutSettingsPatch) => void;
  settings: CalloutSettings;
}) {
  const surface = props.settings.style.surface;
  const title = props.settings.style.title;
  return (
    <ContentPopoverSection
      title={translate('content.callout.appearanceSection')}
      dataUi="content.callout-settings.appearance-section"
    >
      <CompactColorSelector
        label={translate('content.callout.backgroundLabel')}
        title={translate('content.callout.backgroundLabel')}
        value={surface.backgroundColor}
        palette={CALLOUT_BACKGROUND_PRESETS}
        onChange={(backgroundColor) => props.onChange({ style: { surface: { backgroundColor } } })}
      />
      <CompactColorSelector
        label={translate('content.callout.borderColorLabel')}
        title={translate('content.callout.borderColorLabel')}
        value={surface.borderColor}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(borderColor) => props.onChange({ style: { surface: { borderColor } } })}
      />
      <CalloutRangeControl
        label={translate('content.callout.borderWidthLabel')}
        min={0}
        max={12}
        step={1}
        value={surface.borderWidth}
        onChange={(borderWidth) => props.onChange({ style: { surface: { borderWidth } } })}
      />
      <CompactColorSelector
        label={translate('content.callout.textLabel')}
        title={translate('content.callout.textLabel')}
        value={surface.textColor}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(textColor) => props.onChange({ style: { surface: { textColor } } })}
      />
      <CalloutRangeControl
        label={translate('content.callout.radiusLabel')}
        min={0}
        max={48}
        step={1}
        value={surface.radius}
        onChange={(radius) => props.onChange({ style: { surface: { radius } } })}
      />
      <CalloutRangeControl
        label={translate('content.callout.paddingXLabel')}
        min={0}
        max={48}
        step={1}
        value={surface.paddingX}
        onChange={(paddingX) => props.onChange({ style: { surface: { paddingX } } })}
      />
      <CalloutRangeControl
        label={translate('content.callout.paddingYLabel')}
        min={0}
        max={48}
        step={1}
        value={surface.paddingY}
        onChange={(paddingY) => props.onChange({ style: { surface: { paddingY } } })}
      />
      <CalloutRangeControl
        label={translate('content.callout.shadowLabel')}
        min={0}
        max={32}
        step={1}
        value={surface.shadow}
        onChange={(shadow) => props.onChange({ style: { surface: { shadow } } })}
      />
      <ProductGlassChip
        active={title.enabled}
        onClick={() => props.onChange({ style: { title: { enabled: !title.enabled } } })}
      >
        {translate('content.callout.titleToggle')}
      </ProductGlassChip>
      {title.enabled ? (
        <>
          <CompactColorSelector
            label={translate('content.callout.titleBackgroundLabel')}
            title={translate('content.callout.titleBackgroundLabel')}
            value={title.backgroundColor}
            palette={CALLOUT_BACKGROUND_PRESETS}
            onChange={(backgroundColor) =>
              props.onChange({ style: { title: { backgroundColor } } })
            }
          />
          <CompactColorSelector
            label={translate('content.callout.titleTextLabel')}
            title={translate('content.callout.titleTextLabel')}
            value={title.textColor}
            palette={CALLOUT_TEXT_PRESETS}
            onChange={(textColor) => props.onChange({ style: { title: { textColor } } })}
          />
          <CalloutRangeControl
            label={translate('content.callout.titleFontSizeLabel')}
            min={10}
            max={32}
            step={1}
            value={title.fontSize}
            onChange={(fontSize) => props.onChange({ style: { title: { fontSize } } })}
          />
          <ProductGlassBoldButton
            active={title.fontWeight === 'bold'}
            onClick={() =>
              props.onChange({
                style: {
                  title: { fontWeight: title.fontWeight === 'bold' ? 'normal' : 'bold' },
                },
              })
            }
          >
            {translate('content.callout.boldTitle')}
          </ProductGlassBoldButton>
        </>
      ) : null}
    </ContentPopoverSection>
  );
}

export function CalloutConnectorSection(props: {
  onChange: (patch: CalloutSettingsPatch) => void;
  settings: CalloutSettings;
}) {
  const connector = props.settings.style.connector;
  return (
    <ContentPopoverSection title={translate('content.callout.connectorSection')}>
      <ProductGlassRow>
        {(['none', 'wedge', 'line'] as CalloutConnectorKind[]).map((kind) => (
          <ProductGlassChip
            key={kind}
            active={connector.kind === kind}
            onClick={() => props.onChange({ style: { connector: { kind } } })}
          >
            {translate(`content.callout.connector.${kind}`)}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>
      {connector.kind === 'line' ? (
        <>
          <ProductGlassRow>
            {(['straight', 'elbow'] as const).map((routing) => (
              <ProductGlassChip
                key={routing}
                active={connector.routing === routing}
                onClick={() => props.onChange({ style: { connector: { routing } } })}
              >
                {translate(`content.callout.routing.${routing}`)}
              </ProductGlassChip>
            ))}
          </ProductGlassRow>
          <MarkerSelect
            label={translate('content.callout.blockMarker')}
            value={connector.blockMarker}
            onChange={(blockMarker) => props.onChange({ style: { connector: { blockMarker } } })}
          />
          <MarkerSelect
            label={translate('content.callout.frameMarker')}
            value={connector.frameMarker}
            onChange={(frameMarker) => props.onChange({ style: { connector: { frameMarker } } })}
          />
          <CompactColorSelector
            label={translate('content.callout.connectorColor')}
            title={translate('content.callout.connectorColor')}
            value={connector.color}
            palette={CALLOUT_TEXT_PRESETS}
            onChange={(color) => props.onChange({ style: { connector: { color } } })}
          />
          <CalloutRangeControl
            label={translate('content.callout.connectorWidthLabel')}
            min={1}
            max={12}
            step={1}
            value={connector.width}
            onChange={(width) => props.onChange({ style: { connector: { width } } })}
          />
        </>
      ) : null}
      {connector.kind === 'wedge' ? (
        <CalloutRangeControl
          label={translate('content.callout.tailSizeLabelPrefix')}
          min={4}
          max={20}
          step={1}
          value={connector.wedgeSize}
          onChange={(wedgeSize) => props.onChange({ style: { connector: { wedgeSize } } })}
        />
      ) : null}
    </ContentPopoverSection>
  );
}

function MarkerSelect(props: {
  label: string;
  onChange: (marker: CalloutConnectorMarker) => void;
  value: CalloutConnectorMarker;
}) {
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        onChange={(event) => {
          const marker = parseCalloutConnectorMarker(event.target.value);
          if (marker) props.onChange(marker);
        }}
      >
        {MARKERS.map((marker) => (
          <option key={marker} value={marker}>
            {translate(`content.callout.marker.${marker}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CalloutTypographySection(props: {
  onChange: (patch: CalloutSettingsPatch) => void;
  settings: CalloutSettings;
}) {
  const typography = props.settings.style.typography;
  return (
    <ContentPopoverSection title={translate('content.callout.typographySection')}>
      <ProductGlassRow>
        {(['sans', 'serif', 'mono'] as const).map((fontFamily) => (
          <ProductGlassChip
            key={fontFamily}
            active={typography.fontFamily === fontFamily}
            onClick={() => props.onChange({ style: { typography: { fontFamily } } })}
          >
            {translate(`content.callout.font.${fontFamily}`)}
          </ProductGlassChip>
        ))}
        <ProductGlassBoldButton
          active={typography.fontWeight === 'bold'}
          onClick={() =>
            props.onChange({
              style: {
                typography: {
                  fontWeight: typography.fontWeight === 'bold' ? 'normal' : 'bold',
                },
              },
            })
          }
        >
          {translate('content.callout.boldTitle')}
        </ProductGlassBoldButton>
      </ProductGlassRow>
      <CalloutRangeControl
        label={translate('content.callout.fontSizeLabelPrefix')}
        min={10}
        max={36}
        step={1}
        value={typography.fontSize}
        onChange={(fontSize) => props.onChange({ style: { typography: { fontSize } } })}
      />
      <CalloutRangeControl
        label={translate('content.callout.maxWidthLabelPrefix')}
        min={80}
        max={600}
        step={10}
        value={typography.maxWidth}
        onChange={(maxWidth) => props.onChange({ style: { typography: { maxWidth } } })}
      />
    </ContentPopoverSection>
  );
}

export function CalloutDeleteButton(props: { onDelete: () => void }) {
  return (
    <ProductGlassDestructiveButton onClick={props.onDelete}>
      {translate('content.callout.disableButton')}
    </ProductGlassDestructiveButton>
  );
}
