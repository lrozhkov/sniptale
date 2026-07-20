import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import { translate } from '../../../platform/i18n';
import { ColorField, NumericRow } from '../../chrome/ui';

function RangeField(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <NumericRow
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      precision={Number.isInteger(props.step) ? 0 : 2}
      onPreviewValue={props.onChange}
      onCommitValue={props.onChange}
      scrub={{ min: props.min, max: props.max, step: props.step }}
    />
  );
}

function renderGammaFields(
  effect: Extract<EditorRasterEffect, { id: 'gamma' }>,
  onChange: (effect: EditorRasterEffect) => void
) {
  return (
    <>
      <RangeField
        label={translate('editor.toolbar.layerEffectsRed')}
        min={0.2}
        max={2}
        step={0.05}
        value={effect.red}
        onChange={(red) => onChange({ ...effect, red })}
      />
      <RangeField
        label={translate('editor.toolbar.layerEffectsGreen')}
        min={0.2}
        max={2}
        step={0.05}
        value={effect.green}
        onChange={(green) => onChange({ ...effect, green })}
      />
      <RangeField
        label={translate('editor.toolbar.layerEffectsBlue')}
        min={0.2}
        max={2}
        step={0.05}
        value={effect.blue}
        onChange={(blue) => onChange({ ...effect, blue })}
      />
    </>
  );
}

function renderColorizeFields(
  effect: Extract<EditorRasterEffect, { id: 'colorize' }>,
  onChange: (effect: EditorRasterEffect) => void
) {
  return (
    <>
      <ColorField
        title={translate('editor.toolbar.layerEffectsTint')}
        label={translate('editor.toolbar.layerEffectsTint')}
        value={effect.color}
        recentColors={[]}
        palette={[effect.color]}
        onChange={(color) => onChange({ ...effect, color })}
      />
      <RangeField
        label={translate('editor.toolbar.layerEffectsOpacity')}
        min={0}
        max={1}
        step={0.05}
        value={effect.alpha}
        onChange={(alpha) => onChange({ ...effect, alpha })}
      />
    </>
  );
}

function renderAmountField(props: {
  effect: Extract<
    EditorRasterEffect,
    { id: 'brightness' | 'contrast' | 'saturation' | 'vibrance' }
  >;
  onChange: (effect: EditorRasterEffect) => void;
}) {
  return (
    <RangeField
      label={translate('editor.toolbar.layerEffectsAmount')}
      min={-1}
      max={1}
      step={0.05}
      value={props.effect.amount}
      onChange={(amount) => props.onChange({ ...props.effect, amount })}
    />
  );
}

function renderHueFields(
  effect: Extract<EditorRasterEffect, { id: 'hue' }>,
  onChange: (effect: EditorRasterEffect) => void
) {
  return (
    <RangeField
      label={translate('editor.toolbar.layerEffectsRotation')}
      min={-1}
      max={1}
      step={0.05}
      value={effect.rotation}
      onChange={(rotation) => onChange({ ...effect, rotation })}
    />
  );
}

function renderBlurFields(
  effect: Extract<EditorRasterEffect, { id: 'blur' }>,
  onChange: (effect: EditorRasterEffect) => void
) {
  return (
    <RangeField
      label={translate('editor.toolbar.layerEffectsBlur')}
      min={0}
      max={1}
      step={0.05}
      value={effect.blur}
      onChange={(blur) => onChange({ ...effect, blur })}
    />
  );
}

function renderNoiseFields(
  effect: Extract<EditorRasterEffect, { id: 'noise' }>,
  onChange: (effect: EditorRasterEffect) => void
) {
  return (
    <RangeField
      label={translate('editor.toolbar.layerEffectsNoise')}
      min={0}
      max={1000}
      step={10}
      value={effect.noise}
      onChange={(noise) => onChange({ ...effect, noise })}
    />
  );
}

function renderPixelateFields(
  effect: Extract<EditorRasterEffect, { id: 'pixelate' }>,
  onChange: (effect: EditorRasterEffect) => void
) {
  return (
    <RangeField
      label={translate('editor.toolbar.layerEffectsPixelSize')}
      min={2}
      max={30}
      step={1}
      value={effect.blocksize}
      onChange={(blocksize) => onChange({ ...effect, blocksize })}
    />
  );
}

function renderReadyMessage() {
  return (
    <p className="text-sm text-[color:var(--sniptale-color-text-secondary)]">
      {translate('editor.toolbar.layerEffectsReadyToApply')}
    </p>
  );
}

export function EditorRasterEffectForm(props: {
  draftEffect: EditorRasterEffect;
  onChange: (effect: EditorRasterEffect) => void;
}) {
  switch (props.draftEffect.id) {
    case 'brightness':
    case 'contrast':
    case 'saturation':
    case 'vibrance': {
      const effect = props.draftEffect as Extract<
        EditorRasterEffect,
        { id: 'brightness' | 'contrast' | 'saturation' | 'vibrance' }
      >;
      return renderAmountField({ effect, onChange: props.onChange });
    }
    case 'gamma':
      return renderGammaFields(props.draftEffect, props.onChange);
    case 'hue': {
      const effect = props.draftEffect as Extract<EditorRasterEffect, { id: 'hue' }>;
      return renderHueFields(effect, props.onChange);
    }
    case 'colorize':
      return renderColorizeFields(props.draftEffect, props.onChange);
    case 'blur': {
      const effect = props.draftEffect as Extract<EditorRasterEffect, { id: 'blur' }>;
      return renderBlurFields(effect, props.onChange);
    }
    case 'noise': {
      const effect = props.draftEffect as Extract<EditorRasterEffect, { id: 'noise' }>;
      return renderNoiseFields(effect, props.onChange);
    }
    case 'pixelate': {
      const effect = props.draftEffect as Extract<EditorRasterEffect, { id: 'pixelate' }>;
      return renderPixelateFields(effect, props.onChange);
    }
    case 'invert':
    case 'grayscale':
    case 'sepia':
    case 'sharpen':
    case 'emboss':
    case 'edge-detect':
    case 'black-white':
    case 'vintage':
    case 'brownie':
    case 'polaroid':
    case 'kodachrome':
    case 'technicolor':
      return renderReadyMessage();
  }
}
