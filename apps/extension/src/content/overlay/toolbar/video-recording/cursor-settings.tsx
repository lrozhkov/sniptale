import { CircleDot, MousePointer2, MousePointerClick, SunDim } from 'lucide-react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { resolvePickerColor } from '@sniptale/ui/color-selector/helpers';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import {
  DEFAULT_VIDEO_CURSOR_EFFECTS,
  VIDEO_CURSOR_EFFECT_LIMITS,
  type VideoCursorEffectSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n';
import { ColorField, NumericRow, ToggleField } from '../../../../ui/compact-inspector-controls';
import { InspectorSurface } from '../../../../ui/compact-inspector-controls/layout';
import { SettingsPopoverHeader } from '../../../../composition/frame-annotation-controls/popover/header';

export type RecordingCursorSettings = {
  cursorHaloEnabled: boolean;
  cursorDimmingEnabled: boolean;
  clickAnimationEnabled: boolean;
  cursorEffects?: VideoCursorEffectSettings;
};

type CursorSection = 'halo' | 'dimming' | 'click' | 'cursor';
type EffectKey = keyof typeof VIDEO_CURSOR_EFFECT_LIMITS;

const EFFECT_FIELDS = {
  halo: [
    ['haloSize', 'content.toolbar.cursorEffectSize', 'px'],
    ['haloOpacity', 'content.toolbar.cursorEffectOpacity', '%'],
  ],
  dimming: [
    ['dimmingRadius', 'content.toolbar.cursorEffectRadius', 'px'],
    ['dimmingOpacity', 'content.toolbar.cursorEffectDimming', '%'],
  ],
  click: [
    ['clickSize', 'content.toolbar.cursorEffectSize', 'px'],
    ['clickDuration', 'content.toolbar.cursorEffectDuration', 's'],
  ],
} as const;

const ENABLE_KEYS = {
  halo: 'cursorHaloEnabled',
  dimming: 'cursorDimmingEnabled',
  click: 'clickAnimationEnabled',
} as const;

const COLOR_KEYS = { halo: 'haloColor', dimming: 'dimmingColor', click: 'clickColor' } as const;

export function RecordingCursorSettingsPanel(props: {
  disabled: boolean;
  settings: RecordingCursorSettings;
  onChange(settings: RecordingCursorSettings): void;
  onPreview(settings: RecordingCursorSettings): void;
  onClose(): void;
}) {
  const effects = props.settings.cursorEffects ?? DEFAULT_VIDEO_CURSOR_EFFECTS;
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const boundaryRef = useMemo(() => ({ current: surface }), [surface]);
  const theme = useResolvedPortalTheme(surface);
  const [accent, setAccent] = useState(() => resolvePickerColor(''));
  useLayoutEffect(() => {
    if (surface)
      setAccent(
        resolvePickerColor(getComputedStyle(surface).getPropertyValue('--sniptale-color-accent'))
      );
  }, [surface, theme]);
  const sections = [
    { id: 'halo', icon: CircleDot, label: translate('content.toolbar.videoRecordingCursorHalo') },
    {
      id: 'dimming',
      icon: SunDim,
      label: translate('content.toolbar.videoRecordingCursorDimming'),
    },
    {
      id: 'click',
      icon: MousePointerClick,
      label: translate('content.toolbar.videoRecordingClickAnimation'),
    },
    { id: 'cursor', icon: MousePointer2, label: translate('content.toolbar.cursorNative') },
  ] satisfies Array<{ id: CursorSection; icon: typeof CircleDot; label: string }>;
  const changeValue = (key: EffectKey, value: number, preview: boolean) => {
    const settings = { ...props.settings, cursorEffects: { ...effects, [key]: value } };
    if (preview) props.onPreview(settings);
    else props.onChange(settings);
  };
  return (
    <InspectorSurface
      ref={setSurface}
      className="sniptale-content-appearance-surface"
      role="dialog"
      aria-label={translate('content.toolbar.cursorSettings')}
      data-ui="content.toolbar.video-recording.cursor-panel"
    >
      <SettingsPopoverHeader
        context="element"
        title={translate('content.toolbar.cursorSettings')}
        closeLabel={translate('content.interactiveFrame.closeEffectSettings')}
        onClose={props.onClose}
      />
      <CategorizedInspector
        ariaLabel={translate('content.toolbar.cursorSettings')}
        initialSection="halo"
        sections={sections}
        showSectionHeading
        renderSection={(section) =>
          section === 'cursor' ? (
            <p
              data-ui="content.toolbar.video-recording.native-cursor"
              className="text-[12px] leading-5 text-[var(--sniptale-color-text-secondary)]"
            >
              {translate('content.toolbar.cursorNativeDescription')}
            </p>
          ) : (
            <div className="grid gap-1">
              <ToggleField
                label={translate('content.toolbar.cursorEffectEnabled')}
                value={props.settings[ENABLE_KEYS[section]]}
                disabled={props.disabled}
                onChange={(enabled) =>
                  props.onChange({ ...props.settings, [ENABLE_KEYS[section]]: enabled })
                }
              />
              <ColorField
                label={translate('content.toolbar.cursorEffectColor')}
                title={translate('content.toolbar.cursorEffectColor')}
                value={effects[COLOR_KEYS[section]] ?? (section === 'dimming' ? '#000000' : accent)}
                disabled={props.disabled}
                allowAlpha={false}
                allowTransparent={false}
                triggerVariant="swatch"
                floatingPlacement="side"
                floatingBoundaryRef={boundaryRef}
                onChange={(color) =>
                  props.onChange({
                    ...props.settings,
                    cursorEffects: { ...effects, [COLOR_KEYS[section]]: color },
                  })
                }
              />
              {EFFECT_FIELDS[section].map(([key, label, unit]) => {
                const divisor = key === 'clickDuration' ? 1000 : 1;
                const [minimum, maximum] = VIDEO_CURSOR_EFFECT_LIMITS[key];
                return (
                  <NumericRow
                    key={key}
                    appearance="plain"
                    label={translate(label)}
                    disabled={props.disabled}
                    min={minimum / divisor}
                    max={maximum / divisor}
                    step={divisor === 1000 ? 0.05 : 1}
                    precision={divisor === 1000 ? 2 : 0}
                    unit={unit}
                    value={effects[key] / divisor}
                    scrub={{
                      min: minimum / divisor,
                      max: maximum / divisor,
                      step: divisor === 1000 ? 0.05 : 1,
                    }}
                    onCommitValue={(value) => changeValue(key, value * divisor, false)}
                    onPreviewValue={(value) => changeValue(key, value * divisor, true)}
                  />
                );
              })}
            </div>
          )
        }
      />
    </InspectorSurface>
  );
}
