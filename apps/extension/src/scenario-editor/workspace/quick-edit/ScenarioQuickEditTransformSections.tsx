import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { ScenarioQuickEditNumberField } from './ScenarioQuickEditFields';

function TransformSectionTitle(props: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
      {props.children}
    </h3>
  );
}

export function ScenarioQuickEditTransformSections(props: {
  step: ScenarioCaptureStep;
  onStepChange: (patch: Partial<ScenarioCaptureStep>) => void;
}) {
  return (
    <div className="grid gap-4 rounded-[18px] border border-[var(--sniptale-color-border-soft)] p-4">
      <ImageTransformSection onStepChange={props.onStepChange} step={props.step} />
    </div>
  );
}

function ImageTransformSection(props: {
  onStepChange: (patch: Partial<ScenarioCaptureStep>) => void;
  step: ScenarioCaptureStep;
}) {
  return (
    <div className="grid gap-3">
      <TransformSectionTitle>{translate('scenario.editor.imageTransform')}</TransformSectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <ScenarioQuickEditNumberField
          label={translate('scenario.editor.zoom')}
          value={props.step.imageTransform.scale}
          min={0.4}
          max={3}
          step={0.05}
          onChange={(value) =>
            props.onStepChange({
              imageTransform: { ...props.step.imageTransform, scale: value },
            })
          }
        />
        <ScenarioQuickEditNumberField
          label={translate('scenario.editor.offsetX')}
          value={props.step.imageTransform.x}
          min={-480}
          max={480}
          step={4}
          onChange={(value) =>
            props.onStepChange({
              imageTransform: { ...props.step.imageTransform, x: value },
            })
          }
        />
        <ScenarioQuickEditNumberField
          label={translate('scenario.editor.offsetY')}
          value={props.step.imageTransform.y}
          min={-320}
          max={320}
          step={4}
          onChange={(value) =>
            props.onStepChange({
              imageTransform: { ...props.step.imageTransform, y: value },
            })
          }
        />
      </div>
    </div>
  );
}
