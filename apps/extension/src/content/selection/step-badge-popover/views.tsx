import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassInput,
  ProductGlassMiniButton,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassRow,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
  StepBadgeSizeLevel,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { SIZE_LEVEL_DEFAULT, SIZE_LEVEL_MAX, SIZE_LEVEL_MIN } from './helpers';
import { StepBadgeAnchorGrid } from './anchor-grid';
import { StepBadgeAutoFields } from './auto-fields';
import { dispatchStepBadgeReorder } from '../../platform/page-context/frame-events';

export function StepBadgePositionSection(props: {
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  selectedAnchor: StepBadgeAnchor;
  selectedOffsets: string[];
}) {
  return (
    <ContentPopoverSection
      title={translate('content.stepBadge.positionSection')}
      dataUi="content.step-badge.position-section"
    >
      <ProductGlassRow spread>
        <StepBadgeAnchorGrid
          onAnchorChange={props.onAnchorChange}
          onOffsetToggle={props.onOffsetToggle}
          selectedAnchor={props.selectedAnchor}
          selectedOffsets={props.selectedOffsets}
        />
      </ProductGlassRow>
    </ContentPopoverSection>
  );
}

function StepBadgeReorderButton(props: {
  direction: 'up' | 'down';
  frameId: string;
  label: string;
  title: string;
}) {
  return (
    <ProductGlassMiniButton
      onClick={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        dispatchStepBadgeReorder({ direction: props.direction, frameId: props.frameId });
      }}
      title={props.title}
      onMouseDown={(event) => event.preventDefault()}
    >
      {props.label}
    </ProductGlassMiniButton>
  );
}

export function StepBadgeSizeSection(props: {
  onSizeLevelChange: (sizeLevel: StepBadgeSizeLevel) => void;
  sizeLevel: StepBadgeSizeLevel | undefined;
}) {
  return (
    <ContentPopoverSection
      title={translate('content.stepBadge.sizeSection')}
      dataUi="content.step-badge.size-section"
    >
      <ProductGlassRange
        type="range"
        min={SIZE_LEVEL_MIN}
        max={SIZE_LEVEL_MAX}
        step={1}
        value={props.sizeLevel ?? SIZE_LEVEL_DEFAULT}
        onChange={(event) =>
          props.onSizeLevelChange(Number(event.target.value) as StepBadgeSizeLevel)
        }
      />
      <ProductGlassRangeMeta>
        <span>S</span>
        <span>M</span>
        <span>L</span>
      </ProductGlassRangeMeta>
    </ContentPopoverSection>
  );
}

export function StepBadgeAutoSection(props: {
  isAuto: boolean;
  settings: StepBadgeSettings;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onAutoModeChange: (auto: boolean) => void;
  onTypeChange: (type: 'number' | 'letter') => void;
}) {
  return (
    <ContentPopoverSection dataUi="content.step-badge.auto-section">
      <ProductGlassToggleRow
        title={translate('content.stepBadge.autoTitle')}
        hint={translate('content.stepBadge.autoHint')}
        control={
          <ProductGlassSwitch
            onClick={() => props.onAutoModeChange(!props.isAuto)}
            on={props.isAuto}
          />
        }
      />

      {props.isAuto ? (
        <StepBadgeAutoFields
          settings={props.settings}
          onAlphabetChange={props.onAlphabetChange}
          onTypeChange={props.onTypeChange}
        />
      ) : null}
    </ContentPopoverSection>
  );
}

export function StepBadgeValueSection(props: {
  frameId: string;
  isAuto: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <ContentPopoverSection
      title={translate('content.stepBadge.valueSection')}
      dataUi="content.step-badge.value-section"
    >
      <ProductGlassRow>
        {props.isAuto ? (
          <StepBadgeReorderButton
            direction="up"
            frameId={props.frameId}
            label="-"
            title={translate('content.stepBadge.moveUp')}
          />
        ) : null}

        <ProductGlassInput
          type="text"
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          disabled={props.isAuto}
          maxLength={2}
          placeholder={props.isAuto ? translate('content.stepBadge.autoPlaceholder') : ''}
          className="sniptale-step-badge-input"
        />

        {props.isAuto ? (
          <StepBadgeReorderButton
            direction="down"
            frameId={props.frameId}
            label="+"
            title={translate('content.stepBadge.moveDown')}
          />
        ) : null}
      </ProductGlassRow>
    </ContentPopoverSection>
  );
}
