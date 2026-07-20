import { translate } from '../../../platform/i18n';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import {
  ScenarioQuickEditNumberField,
  ScenarioQuickEditSelectField,
  ScenarioQuickEditTextField,
} from './ScenarioQuickEditFields';
import { updateRectOverlay } from './overlay-editor.helpers';
import { ScenarioQuickEditOverlayPointFields } from './overlay-editor.point-fields';

export function TextOverlayEditor(props: {
  overlay: Extract<ScenarioOverlay, { kind: 'text' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid gap-3">
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.textLabel')}
        value={props.overlay.text}
        onChange={(value) => props.onChange({ ...props.overlay, text: value })}
      />
      <TextOverlayPositionFields overlay={props.overlay} onChange={props.onChange} />
      <TextOverlayAppearanceFields overlay={props.overlay} onChange={props.onChange} />
    </div>
  );
}

export function RectOverlayEditor(props: {
  overlay: Exclude<ScenarioOverlay, { kind: 'arrow' | 'click-ring' | 'cursor' | 'text' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  const colorOverlay =
    props.overlay.kind === 'rectangle' || props.overlay.kind === 'ellipse' ? props.overlay : null;
  const blurOverlay = props.overlay.kind === 'blur-rect' ? props.overlay : null;

  return (
    <div className="grid gap-3">
      <RectFrameFields overlay={props.overlay} onChange={props.onChange} />

      {colorOverlay ? <RectStyleFields overlay={colorOverlay} onChange={props.onChange} /> : null}

      {blurOverlay ? <BlurOverlayFields overlay={blurOverlay} onChange={props.onChange} /> : null}
    </div>
  );
}

function BlurOverlayFields(props: {
  overlay: Extract<ScenarioOverlay, { kind: 'blur-rect' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.blurAmount')}
        value={props.overlay.blurSettings.amount}
        min={1}
        max={24}
        onChange={(amount) =>
          props.onChange({
            ...props.overlay,
            blurSettings: { ...props.overlay.blurSettings, amount },
          })
        }
      />
      <ScenarioQuickEditSelectField
        label={translate('scenario.editor.blurType')}
        value={props.overlay.blurSettings.blurType}
        options={[
          {
            label: translate('scenario.editor.blurTypeGaussian'),
            value: 'gaussian',
          },
          {
            label: translate('scenario.editor.blurTypeDistortion'),
            value: 'distortion',
          },
          {
            label: translate('scenario.editor.blurTypeSolid'),
            value: 'solid',
          },
        ]}
        onChange={(blurType) =>
          props.onChange({
            ...props.overlay,
            blurSettings: { ...props.overlay.blurSettings, blurType },
          })
        }
      />
    </div>
  );
}

function TextOverlayPositionFields(props: {
  overlay: Extract<ScenarioOverlay, { kind: 'text' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditOverlayPointFields overlay={props.overlay} onChange={props.onChange} />
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.fontSize')}
        value={props.overlay.fontSize}
        min={10}
        max={64}
        onChange={(value) => props.onChange({ ...props.overlay, fontSize: value })}
      />
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.fontWeight')}
        value={props.overlay.fontWeight}
        min={300}
        max={900}
        step={100}
        onChange={(value) => props.onChange({ ...props.overlay, fontWeight: value })}
      />
    </div>
  );
}

function TextOverlayAppearanceFields(props: {
  overlay: Extract<ScenarioOverlay, { kind: 'text' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.color')}
        value={props.overlay.color}
        onChange={(value) => props.onChange({ ...props.overlay, color: value })}
      />
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.fontFamily')}
        value={props.overlay.fontFamily}
        onChange={(value) => props.onChange({ ...props.overlay, fontFamily: value })}
      />
    </div>
  );
}

function RectFrameFields(props: {
  overlay: Exclude<ScenarioOverlay, { kind: 'arrow' | 'click-ring' | 'cursor' | 'text' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditNumberField
        label="X"
        value={props.overlay.rect.x}
        onChange={(value) => props.onChange(updateRectOverlay(props.overlay, { x: value }))}
      />
      <ScenarioQuickEditNumberField
        label="Y"
        value={props.overlay.rect.y}
        onChange={(value) => props.onChange(updateRectOverlay(props.overlay, { y: value }))}
      />
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.width')}
        value={props.overlay.rect.width}
        min={20}
        onChange={(value) => props.onChange(updateRectOverlay(props.overlay, { width: value }))}
      />
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.height')}
        value={props.overlay.rect.height}
        min={20}
        onChange={(value) => props.onChange(updateRectOverlay(props.overlay, { height: value }))}
      />
    </div>
  );
}

function RectStyleFields(props: {
  overlay: Extract<ScenarioOverlay, { kind: 'rectangle' | 'ellipse' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.strokeColor')}
        value={props.overlay.strokeColor}
        onChange={(value) => props.onChange({ ...props.overlay, strokeColor: value })}
      />
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.fillColor')}
        value={props.overlay.fillColor}
        onChange={(value) => props.onChange({ ...props.overlay, fillColor: value })}
      />
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.strokeWidth')}
        value={props.overlay.strokeWidth}
        min={1}
        max={24}
        onChange={(value) => props.onChange({ ...props.overlay, strokeWidth: value })}
      />
    </div>
  );
}
