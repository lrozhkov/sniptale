import { AlertTriangle, CheckCircle2, CircleStop, Loader2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n/popup';
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

function ExportProgressStepRow({
  counter,
  step,
}: {
  counter: string | null;
  step: PopupExportProgressStep;
}) {
  return (
    <div
      className={progressStepRowClassName}
      data-status={step.status}
      data-step-key={step.key}
      data-ui="popup.export.progress-step"
    >
      <div className={progressStepLabelWrapClassName}>
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
          data-ui="popup.export.progress-step-icon"
        >
          <ExportStepIcon status={step.status} />
        </span>
        <span title={step.label} className={progressStepLabelClassName}>
          {step.label}
        </span>
        <div aria-hidden="true" className={progressStepDividerClassName} />
      </div>
      <span className={cx(progressStepBadgeClassName, getStepStatusClassName(step))}>
        {counter ?? step.statusLabel}
      </span>
    </div>
  );
}

function ExportErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <div
      aria-label={translate('popup.export.issuesTitle')}
      className={progressErrorListClassName}
      data-ui="popup.export.progress-issues"
      role="alert"
    >
      <div className="mb-1 font-semibold">
        {translate('popup.export.issuesTitle')} ({errors.length})
      </div>
      <ul className="space-y-1">
        {errors.map((error, index) => (
          <li key={`${error}-${index}`} className="break-words">
            {error}
          </li>
        ))}
      </ul>
    </div>
  );
}

function getProgressHeading(props: ExportProgressSectionProps) {
  if (!props.result && props.progress.phase === 'cancelled') {
    return translate('content.runtime.exportCancelled');
  }

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
    return null;
  }

  if (props.progress.phase === 'error') {
    return null;
  }

  if (props.progress.phase === 'cancelled') {
    return null;
  }

  const activeStep = props.progressSteps.find((step) => step.status === 'active') ?? null;
  if (props.progress.message) return props.progress.message;
  if (activeStep) return activeStep.label;

  return formatPhaseLabel(props.progress);
}

function ExportSummaryIcon(props: ExportProgressSectionProps) {
  if (!props.result && props.progress.phase === 'cancelled') {
    return <CircleStop className="h-5 w-5 text-[var(--sniptale-color-text-secondary)]" />;
  }

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
            <div
              title={description}
              className={descriptionClassName}
              data-ui="popup.export.progress-description"
            >
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
    : props.result?.errors.length
      ? props.result.errors
      : props.progress.errors;
  const activeCounter =
    props.progress.phase === 'downloading' && props.progress.total > 0
      ? `${props.progress.current}/${props.progress.total}`
      : null;

  return (
    <div className={exportSectionContainerClassName}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <ExportStatusHeader {...props} />
        <div className={progressStepListClassName}>
          {props.progressSteps.map((step) => (
            <ExportProgressStepRow
              key={step.key}
              counter={step.status === 'active' ? activeCounter : null}
              step={step}
            />
          ))}
        </div>
        <ExportErrors errors={currentErrors} />
      </div>
    </div>
  );
}
