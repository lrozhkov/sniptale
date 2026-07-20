import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  FrameData,
} from '../../../features/highlighter/contracts';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';

type FrameDataFixtureOverrides = Omit<
  Partial<FrameData>,
  | 'borderSettings'
  | 'blurSettings'
  | 'focusSettings'
  | 'stepBadge'
  | 'callout'
  | 'linkedElement'
  | 'offset'
> & {
  borderSettings?: BorderPreset | null;
  blurSettings?: BlurSettings | null;
  focusSettings?: FocusSettings | null;
  stepBadge?: StepBadgeSettings | null;
  callout?: CalloutSettings | null;
  linkedElement?: HTMLElement | null;
  offset?: FrameData['offset'] | null;
};

export function createBorderSettingsFixture(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    color: '#000000',
    customCss: '',
    id: 'border',
    isSystemDefault: true,
    name: 'Default Border',
    opacity: 1,
    strokeOpacity: 1,
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    order: 0,
    padding: { bottom: 0, left: 0, right: 0, top: 0 },
    radius: 6,
    shadow: 0,
    style: 'solid',
    width: 2,
    ...overrides,
  };
}

export function createBlurSettingsFixture(overrides: Partial<BlurSettings> = {}): BlurSettings {
  return {
    amount: 12,
    blurType: 'gaussian',
    showBorder: true,
    ...overrides,
  };
}

export function createFocusSettingsFixture(overrides: Partial<FocusSettings> = {}): FocusSettings {
  return {
    opacity: 0.4,
    showBorder: false,
    ...overrides,
  };
}

export function createStepBadgeSettingsFixture(
  overrides: Partial<StepBadgeSettings> = {}
): StepBadgeSettings {
  return {
    enabled: true,
    anchor: 'top-left',
    offsetDirections: [],
    type: 'number',
    alphabet: 'cyrillic',
    value: '',
    sizeLevel: 3,
    auto: true,
    ...overrides,
  };
}

export function createCalloutSettingsFixture(
  overrides: Partial<CalloutSettings> = {}
): CalloutSettings {
  return {
    anchor: 'center',
    bgColor: '#fff',
    enabled: true,
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 'normal',
    htmlContent: '<p>saved comment</p>',
    maxWidth: 180,
    side: 'top',
    tailSize: 10,
    textColor: '#111',
    variant: 'bubble',
    ...overrides,
  };
}

export function createFrameDataFixture(
  id: string,
  overrides: FrameDataFixtureOverrides = {}
): FrameData {
  const {
    borderSettings,
    blurSettings,
    callout,
    focusSettings,
    linkedElement,
    offset,
    stepBadge,
    ...rest
  } = overrides;

  return {
    id,
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    effectMode: 'border',
    borderSettings: borderSettings ?? createBorderSettingsFixture(),
    ...rest,
    ...(blurSettings == null ? {} : { blurSettings }),
    ...(focusSettings == null ? {} : { focusSettings }),
    ...(stepBadge == null ? {} : { stepBadge }),
    ...(callout == null ? {} : { callout }),
    ...(linkedElement == null ? {} : { linkedElement }),
    ...(offset == null ? {} : { offset }),
  };
}
