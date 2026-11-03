import { translate } from '../platform/i18n';
import {
  DEFAULT_CURSOR_COMPOSITION,
  type CursorCompositionSettings,
} from '../features/video/project/motion/spatial';
import { SegmentedRow } from './compact-inspector-controls';
import { PreviewNumericRow } from './compact-inspector-controls/numeric-preview';

/** Both editors retain their own mutation and preview transactions. */
export function CameraFollowTargetControls(props: {
  following: boolean;
  cursorAvailable: boolean;
  onChange(following: boolean): void;
}) {
  return (
    <div className="sniptale-parameter-stack" data-ui="camera.followTarget">
      <SegmentedRow<'cursor' | 'manual'>
        label={translate('editor.scene.cameraFollowTarget')}
        columns={2}
        ariaLabel={translate('editor.scene.cameraFollowTarget')}
        value={props.following ? 'cursor' : 'manual'}
        options={[
          {
            value: 'cursor',
            label: translate('editor.scene.cameraFollowCursor'),
            disabled: !props.cursorAvailable,
          },
          { value: 'manual', label: translate('editor.scene.cameraFollowManual') },
        ]}
        onChange={(value) => props.onChange(value === 'cursor')}
      />
      {!props.cursorAvailable ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.cursorFocusUnavailable')}
        </p>
      ) : null}
    </div>
  );
}

const unchangedComposition: CursorCompositionSettings = {
  ...DEFAULT_CURSOR_COMPOSITION,
  mode: 'off',
};

/** A short automatic camera surface keeps authored manual angles outside its transaction. */
export function CameraCompositionControls(props: {
  value?: CursorCompositionSettings | undefined;
  previewValue?: CursorCompositionSettings | undefined;
  onChange(value: CursorCompositionSettings): void;
  onPreview?(value: CursorCompositionSettings | null): void;
}) {
  const value = props.value ?? unchangedComposition;
  const labels = {
    off: 'editor.scene.cameraCompositionOff',
    orbit: 'editor.scene.cameraCompositionOrbit',
    left: 'editor.scene.cameraCompositionLeft',
    right: 'editor.scene.cameraCompositionRight',
  } as const;
  const number = (key: 'amount' | 'smoothness') => (
    <PreviewNumericRow
      enterBehavior="blur"
      label={translate(
        key === 'amount'
          ? 'editor.scene.cameraCompositionAmount'
          : 'editor.scene.cameraCompositionSmoothness'
      )}
      value={value[key] * 100}
      previewValue={props.previewValue ? props.previewValue[key] * 100 : undefined}
      unit="%"
      min={0}
      max={100}
      step={1}
      precision={0}
      onPreview={(next) =>
        props.onPreview?.(next === null ? null : { ...value, [key]: next / 100 })
      }
      onChange={(next) => props.onChange({ ...value, [key]: next / 100 })}
    />
  );
  return (
    <div className="sniptale-parameter-stack" data-ui="camera.composition">
      <SegmentedRow<CursorCompositionSettings['mode']>
        columns={4}
        ariaLabel={translate('editor.scene.cameraComposition')}
        label={translate('editor.scene.cameraComposition')}
        value={value.mode}
        options={(['off', 'orbit', 'left', 'right'] as const).map((mode) => ({
          value: mode,
          label: translate(labels[mode]),
        }))}
        onChange={(mode) => props.onChange({ ...value, mode })}
      />
      {value.mode !== 'off' ? number('amount') : null}
      {number('smoothness')}
    </div>
  );
}
