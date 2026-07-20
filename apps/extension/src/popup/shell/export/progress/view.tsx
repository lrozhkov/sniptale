import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { cx, formatPhaseLabel } from '../selection/utils';
import type { PopupExportProgressStep } from './steps';
import {
  exportSectionContainerClassName,
  progressDescriptionClassName,
  progressErrorListClassName,
  progressHeaderClassName,
  progressStepActiveClassName,
  progressStepBadgeClassName,
  progressStepDoneClassName,
  progressStepDividerClassName,
  progressStepErrorClassName,
  progressStepIdleClassName,
  progressStepLabelClassName,
  progressStepLabelWrapClassName,
  progressStepListClassName,
  progressStepRowClassName,
} from './styles';
import type { ExportProgressSectionProps } from './types';

function ExportStepIcon({ status }: Pick<PopupExportProgressStep, 'status'>) {
  if (status === 'done') {
    return <CheckCircle2 className="h-4 w-4 text-[var(--sniptale-color-success)]" />;
  }

  if (status === 'error') {
    return <AlertTriangle className="h-4 w-4 text-[var(--sniptale-color-danger)]" />;
  }

  if (status === 'active') {
    return <Loader2 className="h-4 w-4 animate-spin text-[var(--sniptale-color-accent)]" />;
  }

  return <div className="h-2.5 w-2.5 rounded-full bg-[var(--sniptale-color-border-strong)]" />;
}

function getStepStatusClassName(step: PopupExportProgressStep) {
  if (step.status === 'done') {
    return progressStepDoneClassName;
  }

  if (step.status === 'error') {
    return progressStepErrorClassName;
  }

  if (step.status === 'active') {
    return progressStepActiveClassName;
  }

  return progressStepIdleClassName;
}

function ExportProgressStepRow({ step }: { step: PopupExportProgressStep }) {
  return (
    <div className={progressStepRowClassName}>
      <div className={progressStepLabelWrapClassName}>
        <ExportStepIcon status={step.status} />
        <span title={step.label} className={progressStepLabelClassName}>
          {step.label}
        </span>
        <div aria-hidden="true" className={progressStepDividerClassName} />
      </div>
      <span className={cx(progressStepBadgeClassName, getStepStatusClassName(step))}>
        {step.statusLabel}
      </span>
    </div>
  );
}

function ExportErrors({ errors }: { errors: string[] }) {
  if (errors.length <= 1) {
    return null;
  }

  return (
    <div className={progressErrorListClassName}>
      {errors.slice(0, 2).map((error, index) => (
        <div key={`${error}-${index}`} className="truncate">
          • {error}
        </div>
      ))}
    </div>
  );
}

function getProgressHeading(props: ExportProgressSectionProps) {
  if (!props.result && props.progress.phase === 'error') {
    return translate('popup.export.finishedWithErrors');
  }

  if (!props.result) {
    return translate('popup.export.collectingTitle');
  }

  return props.result.success
    ? translate('popup.export.completedTitle')
    : translate('popup.export.finishedWithErrors');
}

function getProgressDescription(props: ExportProgressSectionProps) {
  if (props.result?.success) {
    return props.result.filename ?? null;
  }

  if (props.result && !props.result.success) {
    return props.result.errors[0] ?? props.progress.errors[0] ?? null;
  }

  if (props.progress.phase === 'error') {
    return props.progress.message || props.progress.errors[0] || null;
  }

  const activeStep = props.progressSteps.find((step) => step.status === 'active') ?? null;
  const progressCounter =
    props.progress.phase === 'downloading' && props.progress.total > 0
      ? `${props.progress.current}/${props.progress.total}`
      : null;

  if (activeStep) {
    return progressCounter ? `${activeStep.label} • ${progressCounter}` : activeStep.label;
  }

  return formatPhaseLabel(props.progress);
}

function ExportSummaryIcon(props: ExportProgressSectionProps) {
  if (!props.result && props.progress.phase === 'error') {
    return <AlertTriangle className="h-5 w-5 text-[var(--sniptale-color-danger)]" />;
  }

  if (!props.result) {
    return <Loader2 className="h-5 w-5 animate-spin text-[var(--sniptale-color-accent)]" />;
  }

  if (props.result.success) {
    return <CheckCircle2 className="h-5 w-5 text-[var(--sniptale-color-success)]" />;
  }

  return <AlertTriangle className="h-5 w-5 text-[var(--sniptale-color-danger)]" />;
}

function ExportStatusHeader(props: ExportProgressSectionProps) {
  const description = getProgressDescription(props);
  const descriptionClassName = cx(
    progressDescriptionClassName,
    props.result?.success && 'truncate'
  );

  return (
    <div className={progressHeaderClassName}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          <ExportSummaryIcon {...props} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-5 text-[var(--sniptale-color-text-primary)]">
            {getProgressHeading(props)}
          </div>
          {description ? (
            <div title={description} className={descriptionClassName}>
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExportProgressSectionView(props: ExportProgressSectionProps) {
  const currentErrors = props.result?.success
    ? []
    : (props.result?.errors ?? props.progress.errors);

  return (
    <div className={exportSectionContainerClassName}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <ExportStatusHeader {...props} />
        <div className={progressStepListClassName}>
          {props.progressSteps.map((step) => (
            <ExportProgressStepRow key={step.key} step={step} />
          ))}
        </div>
        <ExportErrors errors={currentErrors} />
      </div>
    </div>
  );
}
