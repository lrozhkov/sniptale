import { useEffect, useState } from 'react';
import type {
  CalloutConnectorKind,
  CalloutConnectorMarker,
  CalloutConnectorRouting,
  CalloutFontFamily,
  CalloutPreset,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  ProductField,
  ProductInput,
  ProductSelect,
  ProductToggle,
} from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { CompactColorSelector } from '../../../../ui/color-selector';
import { translate } from '../../../../platform/i18n';
import { cloneCalloutVisualStyle } from '../../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetPreview } from './preview';
import type { CalloutPresetCatalogController } from './types';

const PALETTE = ['transparent', '#ffffff', '#0f172a', '#2563eb', '#f59e0b', '#dc2626'];

function NumberField(props: {
  label: string;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <ProductField label={props.label}>
      <ProductInput
        type="number"
        min={props.min ?? 0}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </ProductField>
  );
}

function ColorField(props: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <CompactColorSelector
      label={props.label}
      title={props.label}
      value={props.value}
      palette={PALETTE}
      onChange={props.onChange}
    />
  );
}

function SurfaceFields(props: {
  style: CalloutVisualStyle;
  update: (next: CalloutVisualStyle) => void;
}) {
  const updateSurface = (patch: Partial<CalloutVisualStyle['surface']>) =>
    props.update({ ...props.style, surface: { ...props.style.surface, ...patch } });
  return (
    <fieldset className="space-y-3">
      <legend className="sniptale-label-sm">
        {translate('highlighter.calloutPresets.editor.surface')}
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        <ColorField
          label={translate('highlighter.calloutPresets.editor.background')}
          value={props.style.surface.backgroundColor}
          onChange={(backgroundColor) => updateSurface({ backgroundColor })}
        />
        <ColorField
          label={translate('highlighter.calloutPresets.editor.text')}
          value={props.style.surface.textColor}
          onChange={(textColor) => updateSurface({ textColor })}
        />
        <ColorField
          label={translate('highlighter.calloutPresets.editor.border')}
          value={props.style.surface.borderColor}
          onChange={(borderColor) => updateSurface({ borderColor })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <NumberField
          label={translate('highlighter.calloutPresets.editor.radius')}
          value={props.style.surface.radius}
          max={64}
          onChange={(radius) => updateSurface({ radius })}
        />
        <NumberField
          label={translate('highlighter.calloutPresets.editor.borderWidth')}
          value={props.style.surface.borderWidth}
          max={12}
          onChange={(borderWidth) => updateSurface({ borderWidth })}
        />
        <NumberField
          label={translate('highlighter.calloutPresets.editor.paddingX')}
          value={props.style.surface.paddingX}
          max={48}
          onChange={(paddingX) => updateSurface({ paddingX })}
        />
        <NumberField
          label={translate('highlighter.calloutPresets.editor.paddingY')}
          value={props.style.surface.paddingY}
          max={48}
          onChange={(paddingY) => updateSurface({ paddingY })}
        />
        <NumberField
          label={translate('highlighter.calloutPresets.editor.shadow')}
          value={props.style.surface.shadow}
          max={100}
          onChange={(shadow) => updateSurface({ shadow })}
        />
      </div>
    </fieldset>
  );
}

function ConnectorFields(props: {
  style: CalloutVisualStyle;
  update: (next: CalloutVisualStyle) => void;
}) {
  const updateConnector = (patch: Partial<CalloutVisualStyle['connector']>) =>
    props.update({ ...props.style, connector: { ...props.style.connector, ...patch } });
  return (
    <fieldset className="space-y-3">
      <legend className="sniptale-label-sm">
        {translate('highlighter.calloutPresets.editor.connector')}
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        <ProductField label={translate('highlighter.calloutPresets.editor.connectorKind')}>
          <ProductSelect<CalloutConnectorKind>
            value={props.style.connector.kind}
            onChange={(kind) => updateConnector({ kind })}
            options={(['none', 'wedge', 'line'] as const).map((value) => ({
              label: translate(`highlighter.calloutPresets.connector.${value}`),
              value,
            }))}
          />
        </ProductField>
      </div>
      {props.style.connector.kind === 'wedge' ? (
        <NumberField
          label={translate('highlighter.calloutPresets.editor.wedgeSize')}
          value={props.style.connector.wedgeSize}
          min={4}
          max={48}
          onChange={(wedgeSize) => updateConnector({ wedgeSize })}
        />
      ) : null}
      {props.style.connector.kind === 'line' ? (
        <div className="grid gap-3 md:grid-cols-3">
          <ColorField
            label={translate('highlighter.calloutPresets.editor.connectorColor')}
            value={props.style.connector.color}
            onChange={(color) => updateConnector({ color })}
          />
          <NumberField
            label={translate('highlighter.calloutPresets.editor.connectorWidth')}
            value={props.style.connector.width}
            min={1}
            max={12}
            onChange={(width) => updateConnector({ width })}
          />
          <ProductField label={translate('highlighter.calloutPresets.editor.routing')}>
            <ProductSelect<CalloutConnectorRouting>
              value={props.style.connector.routing}
              onChange={(routing) => updateConnector({ routing })}
              options={[
                {
                  label: translate('highlighter.calloutPresets.editor.routingStraight'),
                  value: 'straight',
                },
                {
                  label: translate('highlighter.calloutPresets.editor.routingElbow'),
                  value: 'elbow',
                },
              ]}
            />
          </ProductField>
          <MarkerField
            label={translate('highlighter.calloutPresets.editor.frameMarker')}
            value={props.style.connector.frameMarker}
            onChange={(frameMarker) => updateConnector({ frameMarker })}
          />
          <MarkerField
            label={translate('highlighter.calloutPresets.editor.blockMarker')}
            value={props.style.connector.blockMarker}
            onChange={(blockMarker) => updateConnector({ blockMarker })}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

function MarkerField(props: {
  label: string;
  onChange: (value: CalloutConnectorMarker) => void;
  value: CalloutConnectorMarker;
}) {
  const getLabel = (marker: CalloutConnectorMarker) => {
    if (marker === 'circle') return translate('highlighter.calloutPresets.editor.marker.circle');
    if (marker === 'square') return translate('highlighter.calloutPresets.editor.marker.square');
    if (marker === 'diamond') return translate('highlighter.calloutPresets.editor.marker.diamond');
    if (marker === 'arrow') return translate('highlighter.calloutPresets.editor.marker.arrow');
    return translate('highlighter.calloutPresets.editor.marker.none');
  };
  return (
    <ProductField label={props.label}>
      <ProductSelect<CalloutConnectorMarker>
        value={props.value}
        onChange={props.onChange}
        options={(['none', 'circle', 'square', 'diamond', 'arrow'] as const).map((value) => ({
          label: getLabel(value),
          value,
        }))}
      />
    </ProductField>
  );
}

function TextFields(props: {
  style: CalloutVisualStyle;
  update: (next: CalloutVisualStyle) => void;
}) {
  const updateTypography = (patch: Partial<CalloutVisualStyle['typography']>) =>
    props.update({ ...props.style, typography: { ...props.style.typography, ...patch } });
  const updateTitle = (patch: Partial<CalloutVisualStyle['title']>) =>
    props.update({ ...props.style, title: { ...props.style.title, ...patch } });
  return (
    <fieldset className="space-y-3">
      <legend className="sniptale-label-sm">
        {translate('highlighter.calloutPresets.editor.typography')}
      </legend>
      <div className="grid gap-3 md:grid-cols-4">
        <ProductField label={translate('highlighter.calloutPresets.editor.fontFamily')}>
          <ProductSelect<CalloutFontFamily>
            value={props.style.typography.fontFamily}
            onChange={(fontFamily) => updateTypography({ fontFamily })}
            options={(['sans', 'serif', 'mono'] as const).map((value) => ({
              label: translate(`highlighter.calloutPresets.editor.font.${value}`),
              value,
            }))}
          />
        </ProductField>
        <NumberField
          label={translate('highlighter.calloutPresets.editor.fontSize')}
          value={props.style.typography.fontSize}
          min={8}
          max={72}
          onChange={(fontSize) => updateTypography({ fontSize })}
        />
        <ProductField label={translate('highlighter.calloutPresets.editor.bold')}>
          <ProductToggle
            checked={props.style.typography.fontWeight === 'bold'}
            onClick={() =>
              updateTypography({
                fontWeight: props.style.typography.fontWeight === 'bold' ? 'normal' : 'bold',
              })
            }
          />
        </ProductField>
        <NumberField
          label={translate('highlighter.calloutPresets.editor.maxWidth')}
          value={props.style.typography.maxWidth}
          min={80}
          max={800}
          onChange={(maxWidth) => updateTypography({ maxWidth })}
        />
        <ProductField label={translate('highlighter.calloutPresets.editor.title')}>
          <ProductToggle
            checked={props.style.title.enabled}
            onClick={() => updateTitle({ enabled: !props.style.title.enabled })}
          />
        </ProductField>
      </div>
      {props.style.title.enabled ? (
        <div className="grid gap-3 md:grid-cols-4">
          <ColorField
            label={translate('highlighter.calloutPresets.editor.titleBackground')}
            value={props.style.title.backgroundColor}
            onChange={(backgroundColor) => updateTitle({ backgroundColor })}
          />
          <NumberField
            label={translate('highlighter.calloutPresets.editor.titleFontSize')}
            value={props.style.title.fontSize}
            min={8}
            max={72}
            onChange={(fontSize) => updateTitle({ fontSize })}
          />
          <ProductField label={translate('highlighter.calloutPresets.editor.bold')}>
            <ProductToggle
              checked={props.style.title.fontWeight === 'bold'}
              onClick={() =>
                updateTitle({
                  fontWeight: props.style.title.fontWeight === 'bold' ? 'normal' : 'bold',
                })
              }
            />
          </ProductField>
          <ColorField
            label={translate('highlighter.calloutPresets.editor.titleText')}
            value={props.style.title.textColor}
            onChange={(textColor) => updateTitle({ textColor })}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

export function CalloutPresetEditor({
  controller,
}: {
  controller: CalloutPresetCatalogController;
}) {
  const source =
    controller.editor.preset ??
    controller.catalog?.presets.find((preset) => preset.id === controller.catalog?.defaultPresetId);
  const [name, setName] = useState('');
  const [style, setStyle] = useState<CalloutVisualStyle | null>(null);
  useEffect(() => {
    if (!controller.editor.isOpen || !source) return;
    setName(controller.editor.preset?.name ?? '');
    setStyle(cloneCalloutVisualStyle(source.style));
  }, [controller.editor.isOpen, controller.editor.preset, source]);
  if (!controller.editor.isOpen || !source || !style) return null;
  const preset: CalloutPreset = {
    ...source,
    id: controller.editor.preset?.id ?? '',
    name,
    origin: controller.editor.preset?.origin ?? 'user',
    style,
  };
  return (
    <ProductModal
      isOpen
      width="680px"
      maxWidth="94vw"
      maxHeight="88vh"
      scrollable
      onClose={controller.actions.closeEditor}
    >
      <ProductModalHeader
        compact
        title={
          controller.editor.preset
            ? translate('highlighter.calloutPresets.editor.editTitle')
            : translate('highlighter.calloutPresets.editor.newTitle')
        }
        onClose={controller.actions.closeEditor}
      />
      <ProductModalBody compact className="space-y-5">
        <div className="flex items-center gap-4">
          <CalloutPresetPreview style={style} />
          <ProductField label={translate('highlighter.calloutPresets.editor.name')}>
            <ProductInput
              autoFocus
              value={name}
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
            />
          </ProductField>
        </div>
        <SurfaceFields style={style} update={setStyle} />
        <ConnectorFields style={style} update={setStyle} />
        <TextFields style={style} update={setStyle} />
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton tone="secondary" onClick={controller.actions.closeEditor}>
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          tone="primary"
          disabled={!name.trim() || controller.isSaving}
          onClick={() => void controller.actions.save(preset)}
        >
          {translate('common.actions.save')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}
