import { translate } from '../../../../../platform/i18n';
import type {
  VideoActionClickStyle,
  VideoActionKeyStyle,
} from '../../../../../features/video/project/types';
import { ColorField, SelectInput } from '../shared/controls';
import { InspectorDetails } from '../shared/details';
import { SliderField } from '../shared/sliders';

type CommonProps = {
  disabled: boolean;
  recentColors?: readonly string[] | undefined;
  onRememberRecentColor?: ((color: string) => Promise<void>) | undefined;
};

export function ActionClickStyleFields(
  props: CommonProps & {
    value: VideoActionClickStyle;
    onChange: (value: VideoActionClickStyle) => void;
  }
) {
  const change = (patch: Partial<VideoActionClickStyle>) =>
    props.onChange({ ...props.value, ...patch });
  return (
    <div className="space-y-2">
      <ColorField
        className="min-h-8! border-transparent! bg-transparent! px-0! py-0!"
        label={translate('videoEditor.sidebar.actionColor')}
        value={props.value.color}
        disabled={props.disabled}
        recentColors={props.recentColors}
        onRememberRecentColor={props.onRememberRecentColor}
        onChange={(color) => change({ color })}
      />
      <SliderField
        label={translate('videoEditor.sidebar.actionSize')}
        value={props.value.size}
        min={8}
        max={160}
        step={1}
        disabled={props.disabled}
        onChange={(size) => change({ size })}
      />
      <SliderField
        label={translate('videoEditor.sidebar.actionOpacity')}
        value={props.value.opacity}
        min={0}
        max={1}
        step={0.05}
        disabled={props.disabled}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        onChange={(opacity) => change({ opacity })}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
        <SliderField
          label={translate('videoEditor.sidebar.actionStroke')}
          value={props.value.strokeWidth}
          min={1}
          max={12}
          step={0.5}
          disabled={props.disabled}
          onChange={(strokeWidth) => change({ strokeWidth })}
        />
      </InspectorDetails>
    </div>
  );
}

export function ActionKeyStyleFields(
  props: CommonProps & {
    value: VideoActionKeyStyle;
    onChange: (value: VideoActionKeyStyle) => void;
  }
) {
  const change = (patch: Partial<VideoActionKeyStyle>) =>
    props.onChange({ ...props.value, ...patch });
  return (
    <div className="space-y-2">
      <SelectInput
        label={translate('videoEditor.sidebar.keyPosition')}
        value={props.value.position}
        disabled={props.disabled}
        onChange={(position) => change({ position })}
        options={[
          { value: 'bottom-left', label: translate('videoEditor.sidebar.keyBottomLeft') },
          { value: 'bottom-center', label: translate('videoEditor.sidebar.keyBottomCenter') },
          { value: 'bottom-right', label: translate('videoEditor.sidebar.keyBottomRight') },
          { value: 'top-left', label: translate('videoEditor.sidebar.keyTopLeft') },
          { value: 'top-center', label: translate('videoEditor.sidebar.keyTopCenter') },
          { value: 'top-right', label: translate('videoEditor.sidebar.keyTopRight') },
        ]}
      />
      <SelectInput
        label={translate('videoEditor.sidebar.keyFont')}
        value={props.value.fontFamily}
        disabled={props.disabled}
        onChange={(fontFamily) => change({ fontFamily })}
        options={[
          { value: 'sans-serif', label: translate('videoEditor.sidebar.keySans') },
          { value: 'serif', label: translate('videoEditor.sidebar.keySerif') },
          { value: 'monospace', label: translate('videoEditor.sidebar.keyMono') },
        ]}
      />
      <SliderField
        label={translate('videoEditor.sidebar.keyFontSize')}
        value={props.value.fontSize}
        min={12}
        max={96}
        step={1}
        disabled={props.disabled}
        onChange={(fontSize) => change({ fontSize })}
      />
      <ColorField
        className="min-h-8! border-transparent! bg-transparent! px-0! py-0!"
        label={translate('videoEditor.sidebar.keyTextColor')}
        value={props.value.color}
        disabled={props.disabled}
        recentColors={props.recentColors}
        onRememberRecentColor={props.onRememberRecentColor}
        onChange={(color) => change({ color })}
      />
      <ColorField
        className="min-h-8! border-transparent! bg-transparent! px-0! py-0!"
        label={translate('videoEditor.sidebar.keyBackground')}
        value={props.value.background}
        disabled={props.disabled}
        recentColors={props.recentColors}
        onRememberRecentColor={props.onRememberRecentColor}
        onChange={(background) => change({ background })}
      />
      <SelectInput
        label={translate('videoEditor.sidebar.keyEntrance')}
        value={props.value.entrance}
        disabled={props.disabled}
        onChange={(entrance) => change({ entrance })}
        options={[
          { value: 'fade', label: translate('videoEditor.sidebar.keyFade') },
          { value: 'slide', label: translate('videoEditor.sidebar.keySlide') },
          { value: 'none', label: translate('videoEditor.sidebar.keyInstant') },
        ]}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
        <SliderField
          label={translate('videoEditor.sidebar.actionOpacity')}
          value={props.value.opacity}
          min={0}
          max={1}
          step={0.05}
          disabled={props.disabled}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacity) => change({ opacity })}
        />
        <SliderField
          label={translate('videoEditor.sidebar.keyRadius')}
          value={props.value.cornerRadius}
          min={0}
          max={32}
          step={1}
          disabled={props.disabled}
          onChange={(cornerRadius) => change({ cornerRadius })}
        />
        <SliderField
          label={translate('videoEditor.sidebar.keyMargin')}
          value={props.value.margin}
          min={0}
          max={160}
          step={1}
          disabled={props.disabled}
          onChange={(margin) => change({ margin })}
        />
      </InspectorDetails>
    </div>
  );
}
