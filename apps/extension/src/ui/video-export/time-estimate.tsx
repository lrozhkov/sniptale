import { useEffect, useMemo, useState } from 'react';
import { formatDateTime, formatNumber, translate, useAppLocale } from '../../platform/i18n';
import type { AppLocale } from '../../platform/i18n';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';

function durationLabel(milliseconds: number, locale: AppLocale): string {
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
  const rounded = seconds < 60 ? seconds : Math.ceil(seconds / 10) * 10;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const parts: string[] = [];
  if (hours)
    parts.push(
      `${formatNumber(hours, undefined, locale)} ${translate('videoEditor.progress.timeHour')}`
    );
  if (minutes)
    parts.push(
      `${formatNumber(minutes, undefined, locale)} ${translate('videoEditor.progress.timeMinute')}`
    );
  if (!hours && rounded % 60)
    parts.push(
      `${formatNumber(rounded % 60, undefined, locale)} ${translate('videoEditor.progress.timeSecond')}`
    );
  return parts.join(' ');
}

function completionLabel(remainingMs: number, locale: AppLocale): string | null {
  try {
    const now = new Date(Date.now());
    const finish = new Date(now.getTime() + remainingMs);
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(finish.getTime())) return null;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sameDay = (left: Date, right: Date) =>
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();
    const clock = formatDateTime(finish, { hour: '2-digit', minute: '2-digit' }, locale);
    if (sameDay(now, finish)) return clock;
    if (sameDay(tomorrow, finish))
      return `${translate('videoEditor.progress.timeTomorrow')} ${clock}`;
    return formatDateTime(
      finish,
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      locale
    );
  } catch {
    return null;
  }
}

/** Disposable local display clock; only the export producer estimates the remaining work. */
export function VideoExportTimeHint({
  estimate,
  active,
  finishing = false,
}: {
  estimate?: VideoProjectExportTimeEstimate | null | undefined;
  active: boolean;
  finishing?: boolean;
}) {
  const locale = useAppLocale();
  const sample = useMemo(
    () => ({ estimate: active ? estimate : null, receivedAt: performance.now() }),
    [estimate, active]
  );
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active || finishing || !estimate) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active, finishing, estimate]);
  if (!active || finishing) return null;
  const elapsed = performance.now() - sample.receivedAt;
  const remaining = sample.estimate ? sample.estimate.remainingMs - Math.max(0, elapsed) : NaN;
  const valid = Number.isFinite(remaining) && remaining > 0 && Number.isFinite(elapsed);
  const completion = valid ? completionLabel(remaining, locale) : null;
  return (
    <div
      data-ui="video.exportTimeEstimate"
      className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]"
    >
      {valid ? (
        <>
          <span>
            {translate('videoEditor.progress.timeRemaining')} ≈ {durationLabel(remaining, locale)}
          </span>
          {completion ? (
            <span>
              {translate('videoEditor.progress.timeCompletion')} ≈ {completion}
            </span>
          ) : null}
        </>
      ) : (
        <span>
          {translate(
            estimate ? 'videoEditor.progress.timeRefining' : 'videoEditor.progress.timeEstimating'
          )}
        </span>
      )}
    </div>
  );
}
