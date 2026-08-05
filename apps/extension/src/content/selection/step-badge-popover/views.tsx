import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassInput,
  ProductGlassMiniButton,
  ProductGlassRow,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgeAnchorGrid } from './anchor-grid';
import { StepBadgeAutoFields } from './auto-fields';
import { dispatchStepBadgeReorder } from '../../platform/page-context/frame-events';
import { HighlighterPresetPropertyField as PropertyField } from '../../../ui/highlighter-preset-editor/inspector-field';

export function StepBadgePositionSection(props: {
  embedded?: boolean;
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  selectedAnchor: StepBadgeAnchor;
  selectedOffsets: string[];
}) {
  const content = (
    <StepBadgeAnchorGrid
      onAnchorChange={props.onAnchorChange}
      onOffsetToggle={props.onOffsetToggle}
      selectedAnchor={props.selectedAnchor}
      selectedOffsets={props.selectedOffsets}
    />
  );
  if (props.embedded) return content;
  return (
    <ContentPopoverSection
      title={translate('content.stepBadge.positionSection')}
      dataUi="content.step-badge.position-section"
    >
      {content}
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

export function StepBadgeAutoSection(props: {
  embedded?: boolean;
  isAuto: boolean;
  settings: StepBadgeSettings;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onAutoModeChange: (auto: boolean) => void;
  onTypeChange: (type: 'number' | 'letter') => void;
}) {
  const content = (
    <>
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
    </>
  );
  if (props.embedded) return content;
  return (
    <ContentPopoverSection dataUi="content.step-badge.auto-section">
      {content}
    </ContentPopoverSection>
  );
}

export function StepBadgeValueSection(props: {
  embedded?: boolean;
  frameId: string;
  isAuto: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const valueControl = (
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
        aria-label={translate('content.stepBadge.valueSection')}
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
  );
  if (props.embedded) {
    return (
      <PropertyField label={translate('content.stepBadge.valueSection')}>
        {valueControl}
      </PropertyField>
    );
  }
  return (
    <ContentPopoverSection
      title={translate('content.stepBadge.valueSection')}
      dataUi="content.step-badge.value-section"
    >
      {valueControl}
    </ContentPopoverSection>
  );
}
