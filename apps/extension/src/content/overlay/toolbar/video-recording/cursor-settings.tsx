import { CircleDot, MousePointer2, MousePointerClick, SunDim } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { multiplyColorAlpha } from '@sniptale/foundation/color';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { resolvePickerColor } from '@sniptale/ui/color-selector/helpers';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import {
  DEFAULT_VIDEO_CURSOR_EFFECTS,
  VIDEO_CURSOR_EFFECT_LIMITS,
  type VideoCursorEffectSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n';
import { ColorField, NumericRow, SelectField } from '../../../../ui/compact-inspector-controls';
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
    ['haloStroke', 'gallery.videoReview.clickStroke', 'px'],
    ['haloGlow', 'gallery.videoReview.click_glow', 'px'],
  ],
  dimming: [
    ['dimmingRadius', 'content.toolbar.cursorEffectRadius', 'px'],
    ['dimmingOpacity', 'content.toolbar.cursorEffectDimming', '%'],
  ],
  click: [
    ['clickSize', 'content.toolbar.cursorEffectSize', 'px'],
    ['clickDuration', 'content.toolbar.cursorEffectDuration', 's'],
    ['clickStroke', 'gallery.videoReview.clickStroke', 'px'],
    ['clickPulses', 'gallery.videoReview.clickPulses', ''],
  ],
} as const;

const ENABLE_KEYS = {
  halo: 'cursorHaloEnabled',
  dimming: 'cursorDimmingEnabled',
  click: 'clickAnimationEnabled',
} as const;

const COLOR_KEYS = { halo: 'haloColor', dimming: 'dimmingColor', click: 'clickColor' } as const;

function ClickStyleFields(props: {
  disabled: boolean;
  effects: VideoCursorEffectSettings;
  onChange(effects: VideoCursorEffectSettings): void;
}) {
  return (
    <>
      <SelectField
        label={translate('gallery.videoReview.clickEffect')}
        value={props.effects.clickEffect ?? 'ripple'}
        disabled={props.disabled}
        options={(['ripple', 'press', 'glow'] as const).map((value) => ({
          value,
          label: translate(`gallery.videoReview.click_${value}`),
        }))}
        onChange={(clickEffect) => props.onChange({ ...props.effects, clickEffect })}
      />
      <SelectField
        label={translate('gallery.videoReview.clickEasing')}
        value={props.effects.clickEasing ?? 'ease-out'}
        disabled={props.disabled}
        options={(['linear', 'ease-out', 'ease-in-out'] as const).map((value) => ({
          value,
          label: translate(`gallery.videoReview.click_${value}`),
        }))}
        onChange={(clickEasing) => props.onChange({ ...props.effects, clickEasing })}
      />
    </>
  );
}

export function RecordingCursorSettingsPanel(props: {
  disabled: boolean;
  settings: RecordingCursorSettings;
  onChange(settings: RecordingCursorSettings): void;
  onPreview(settings: RecordingCursorSettings): void;
  onClose(): void;
}) {
  const effects = props.settings.cursorEffects ?? DEFAULT_VIDEO_CURSOR_EFFECTS;
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const theme = useResolvedPortalTheme(surface);
  const [accent, setAccent] = useState(() => resolvePickerColor(''));
  useLayoutEffect(() => {
    if (surface)
      setAccent(
        resolvePickerColor(getComputedStyle(surface).getPropertyValue('--sniptale-color-accent'))
      );
  }, [surface, theme]);
  const sections = [
    {
      id: 'click',
      icon: MousePointerClick,
      label: translate('content.toolbar.videoRecordingClickAnimation'),
    },
    { id: 'halo', icon: CircleDot, label: translate('content.toolbar.videoRecordingCursorHalo') },
    {
      id: 'dimming',
      icon: SunDim,
      label: translate('content.toolbar.videoRecordingCursorDimming'),
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
        initialSection="click"
        sections={sections}
        showSectionHeading
        renderSectionHeadingControl={(section) =>
          section === 'cursor' ? null : (
            <ProductGlassSwitch
              role="switch"
              aria-label={sections.find((item) => item.id === section)!.label}
              aria-checked={props.settings[ENABLE_KEYS[section]]}
              on={props.settings[ENABLE_KEYS[section]]}
              disabled={props.disabled}
              onClick={() =>
                props.onChange({
                  ...props.settings,
                  [ENABLE_KEYS[section]]: !props.settings[ENABLE_KEYS[section]],
                })
              }
            />
          )
        }
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
              {section === 'click' ? (
                <ClickStyleFields
                  effects={effects}
                  disabled={props.disabled}
                  onChange={(cursorEffects) => props.onChange({ ...props.settings, cursorEffects })}
                />
              ) : null}
              <ColorField
                label={translate('content.toolbar.cursorEffectColor')}
                title={translate('content.toolbar.cursorEffectColor')}
                value={
                  section === 'halo'
                    ? (multiplyColorAlpha(effects.haloColor ?? accent, effects.haloOpacity / 100) ??
                      accent)
                    : (effects[COLOR_KEYS[section]] ?? (section === 'dimming' ? '#000000' : accent))
                }
                disabled={props.disabled}
                allowAlpha={section !== 'dimming'}
                allowTransparent={false}
                triggerVariant="swatch"
                floatingPlacement="auto"
                onChange={(color) =>
                  props.onChange({
                    ...props.settings,
                    cursorEffects: {
                      ...effects,
                      [COLOR_KEYS[section]]: color,
                      ...(section === 'halo' ? { haloOpacity: 100 } : {}),
                    },
                  })
                }
              />
              {EFFECT_FIELDS[section].map(([key, label, unit]) => {
                if (key === 'clickStroke' && (effects.clickEffect ?? 'ripple') !== 'ripple')
                  return null;
                const divisor = key === 'clickDuration' ? 1000 : 1;
                const [minimum, maximum] = VIDEO_CURSOR_EFFECT_LIMITS[key];
                const fractional = key === 'clickStroke' || key === 'haloStroke';
                const step = divisor === 1000 ? 0.05 : fractional ? 0.5 : 1;
                return (
                  <NumericRow
                    key={key}
                    appearance="plain"
                    label={translate(label)}
                    disabled={props.disabled}
                    min={minimum / divisor}
                    max={maximum / divisor}
                    step={step}
                    precision={divisor === 1000 ? 2 : fractional ? 1 : 0}
                    unit={unit}
                    value={(effects[key] ?? DEFAULT_VIDEO_CURSOR_EFFECTS[key]!) / divisor}
                    scrub={{
                      min: minimum / divisor,
                      max: maximum / divisor,
                      step,
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
