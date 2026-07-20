import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { NumericRow, OptionRow, PanelSection } from '../../../../../ui/compact-inspector-controls';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n';

type StableSegmentAction = VideoAutoProcessingSettings['stableSegments']['action'];

const AUTO_TRANSFORM_ACTIONS: StableSegmentAction[] = [
  VideoAutoProcessingAction.SPEED_UP,
  VideoAutoProcessingAction.REMOVE,
  VideoAutoProcessingAction.SKIP,
];

function getActionLabel(action: StableSegmentAction): string {
  switch (action) {
    case VideoAutoProcessingAction.SPEED_UP:
      return translate('videoEditor.timeline.autoTransformActionSpeedUp');
    case VideoAutoProcessingAction.REMOVE:
      return translate('videoEditor.timeline.autoTransformActionRemove');
    case VideoAutoProcessingAction.SKIP:
      return translate('videoEditor.timeline.autoTransformActionSkip');
  }
}

function getActionDescription(action: StableSegmentAction): string {
  switch (action) {
    case VideoAutoProcessingAction.SPEED_UP:
      return translate('videoEditor.timeline.autoTransformActionSpeedUpDescription');
    case VideoAutoProcessingAction.REMOVE:
      return translate('videoEditor.timeline.autoTransformActionRemoveDescription');
    case VideoAutoProcessingAction.SKIP:
      return translate('videoEditor.timeline.autoTransformActionSkipDescription');
  }
}

function updateStableSegments(
  settings: VideoAutoProcessingSettings,
  patch: Partial<VideoAutoProcessingSettings['stableSegments']>
): VideoAutoProcessingSettings {
  return {
    ...settings,
    stableSegments: {
      ...settings.stableSegments,
      ...patch,
    },
  };
}

function NumberField(props: {
  label: string;
  min: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumericRow
      label={props.label}
      min={props.min}
      step={props.step}
      value={props.value}
      precision={1}
      onPreviewValue={props.onChange}
      onCommitValue={props.onChange}
    />
  );
}

function ActionChoice(props: {
  action: StableSegmentAction;
  active: boolean;
  onSelect: (action: StableSegmentAction) => void;
}) {
  return (
    <OptionRow
      active={props.active}
      label={
        <span className="block min-w-0">
          <span className="block truncate text-[12px] font-semibold text-[var(--sniptale-color-text-primary)]">
            {getActionLabel(props.action)}
          </span>
          <span className="mt-1 block text-[10px] leading-snug text-[var(--sniptale-color-text-dim)]">
            {getActionDescription(props.action)}
          </span>
        </span>
      }
      onToggle={() => props.onSelect(props.action)}
    />
  );
}

function WizardSignalStep() {
  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-dim)]">
        {translate('videoEditor.timeline.autoTransformSignalStep')}
      </p>
      <p className="text-[12px] leading-snug text-[var(--sniptale-color-text-secondary)]">
        {translate('videoEditor.timeline.autoTransformStableDescription')}
      </p>
    </section>
  );
}

function WizardDecisionStep(props: {
  draft: VideoAutoProcessingSettings;
  onDraftChange: (settings: VideoAutoProcessingSettings) => void;
}) {
  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-dim)]">
        {translate('videoEditor.timeline.autoTransformDecisionStep')}
      </p>
      <div className="grid gap-2">
        {AUTO_TRANSFORM_ACTIONS.map((action) => (
          <ActionChoice
            key={action}
            action={action}
            active={props.draft.stableSegments.action === action}
            onSelect={(nextAction) =>
              props.onDraftChange(updateStableSegments(props.draft, { action: nextAction }))
            }
          />
        ))}
      </div>
    </section>
  );
}

function WizardThresholdsStep(props: {
  draft: VideoAutoProcessingSettings;
  onDraftChange: (settings: VideoAutoProcessingSettings) => void;
}) {
  return (
    <section className="grid grid-cols-2 gap-2">
      <NumberField
        label={translate('videoEditor.timeline.autoTransformMinDurationLabel')}
        min={0.1}
        step={0.1}
        value={props.draft.stableSegments.minDurationSeconds}
        onChange={(value) =>
          props.onDraftChange(updateStableSegments(props.draft, { minDurationSeconds: value }))
        }
      />
      <NumberField
        label={translate('videoEditor.timeline.autoTransformSpeedLabel')}
        min={1}
        step={0.1}
        value={props.draft.stableSegments.speedUpPlaybackRate}
        onChange={(value) =>
          props.onDraftChange(updateStableSegments(props.draft, { speedUpPlaybackRate: value }))
        }
      />
    </section>
  );
}

function WizardPreviewStep(props: { draft: VideoAutoProcessingSettings }) {
  return (
    <PanelSection
      label={translate('videoEditor.timeline.autoTransformPreviewStep')}
      value={getActionLabel(props.draft.stableSegments.action)}
    >
      <p className="text-[12px] leading-snug text-[var(--sniptale-color-text-secondary)]">
        {getActionDescription(props.draft.stableSegments.action)}
      </p>
    </PanelSection>
  );
}

function WizardFooter(props: { onApply: () => void; onClose: () => void }) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton tone="secondary" compact onClick={props.onClose}>
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton tone="primary" compact onClick={props.onApply}>
        {translate('videoEditor.timeline.autoTransformApply')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function AutoTransformWizard(props: {
  draft: VideoAutoProcessingSettings;
  onApply: () => void;
  onClose: () => void;
  onDraftChange: (settings: VideoAutoProcessingSettings) => void;
}) {
  return (
    <ProductModal
      onClose={props.onClose}
      width="min(460px, calc(100vw - 28px))"
      maxHeight="calc(100vh - 28px)"
      scrollable
      accent="compact"
    >
      <ProductModalHeader
        compact
        title={translate('videoEditor.timeline.autoTransformWizardTitle')}
        onClose={props.onClose}
      />
      <ProductModalBody compact className="gap-4">
        <WizardSignalStep />
        <WizardDecisionStep draft={props.draft} onDraftChange={props.onDraftChange} />
        <WizardThresholdsStep draft={props.draft} onDraftChange={props.onDraftChange} />
        <WizardPreviewStep draft={props.draft} />
      </ProductModalBody>
      <WizardFooter onClose={props.onClose} onApply={props.onApply} />
    </ProductModal>
  );
}
