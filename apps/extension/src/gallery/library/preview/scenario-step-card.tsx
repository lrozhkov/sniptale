import { translate } from '../../../platform/i18n';
import type { ScenarioRecentStep } from '../../../features/scenario/contracts/types/project';

export function ScenarioPreviewStepCard(props: { step: ScenarioRecentStep }) {
  return (
    <div
      className="overflow-hidden rounded-[18px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] shadow-sm"
    >
      <img
        src={props.step.previewDataUrl}
        alt={props.step.title}
        className="aspect-[16/10] w-full object-cover"
      />
      <div className="px-4 py-3">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.step.title}
        </div>
        <div className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.app.scenarioStepLabel')} {props.step.position + 1}
        </div>
      </div>
    </div>
  );
}
