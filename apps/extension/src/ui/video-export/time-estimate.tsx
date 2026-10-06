import { useEffect, useRef, useState } from 'react';
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

function completionLabel(nowMs: number, finishMs: number, locale: AppLocale): string | null {
  try {
    const now = new Date(nowMs);
    const finish = new Date(finishMs);
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

interface ForecastDisplay {
  remaining: number;
  wallNow: number;
  completionMinute: number | null;
}

/** One clock sample for both labels; a ten-second margin prevents minute-boundary flicker. */
function sampleDisplay(
  remaining: number,
  previousMinute: number | null,
  wallNow = Date.now()
): ForecastDisplay {
  const finish = wallNow + remaining;
  if (!Number.isFinite(finish) || !Number.isFinite(wallNow) || !(remaining > 0))
    return { remaining, wallNow, completionMinute: null };
  const minute = Math.floor(finish / 60_000) * 60_000;
  const retain =
    previousMinute !== null &&
    wallNow < previousMinute + 60_000 &&
    finish >= previousMinute - 10_000 &&
    finish < previousMinute + 70_000;
  return { remaining, wallNow, completionMinute: retain ? previousMinute : minute };
}

interface ForecastClock {
  deadline: number;
  updatedAt: number;
  upwardSince: number | null;
  samples: { at: number; deadline: number }[];
}

/** Smooth deadlines, not remaining durations: elapsed time must not become forecast noise. */
function advanceForecast(
  clock: ForecastClock,
  now: number,
  deadline: number | null
): ForecastClock {
  const samples = clock.samples.filter((sample) => now - sample.at < 8000);
  if (deadline !== null) samples.push({ at: now, deadline });
  const ordered = samples.map((sample) => sample.deadline).sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const target = ordered.length
    ? ordered.length % 2
      ? ordered[middle]!
      : (ordered[middle - 1]! + ordered[middle]!) / 2
    : clock.deadline;
  const difference = target - clock.deadline;
  const upwardSince = difference > 2000 ? (clock.upwardSince ?? now) : null;
  // A delayed/background timer must not spend a large correction budget in one visible jump.
  const elapsed = Math.min(1000, Math.max(0, now - clock.updatedAt));
  const correction =
    difference < -2000
      ? Math.max(difference, -elapsed * 2)
      : upwardSince !== null && now - upwardSince >= 3000
        ? Math.min(difference, elapsed * 2)
        : 0;
  return { deadline: clock.deadline + correction, updatedAt: now, upwardSince, samples };
}

/** Disposable display policy shared by both editors; no additional encoding or storage. */
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
  const clock = useRef<ForecastClock | null>(null);
  const pending = useRef<number | null>(null);
  const [display, setDisplay] = useState<ForecastDisplay>({
    remaining: NaN,
    wallNow: NaN,
    completionMinute: null,
  });
  const enabled = active && !finishing && !!estimate;
  useEffect(() => {
    const now = performance.now();
    const duration = estimate?.remainingMs;
    if (!enabled || !Number.isFinite(now) || !Number.isFinite(duration) || !(duration! > 0)) {
      clock.current = null;
      pending.current = null;
      setDisplay(sampleDisplay(NaN, null));
      return;
    }
    pending.current = now + duration!;
    if (!clock.current || clock.current.deadline <= now) {
      clock.current = {
        deadline: pending.current,
        updatedAt: now,
        upwardSince: null,
        samples: [{ at: now, deadline: pending.current }],
      };
      pending.current = null;
      setDisplay(sampleDisplay(duration!, null));
    }
  }, [enabled, estimate]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const now = performance.now();
      if (!clock.current || !Number.isFinite(now) || now < clock.current.updatedAt) {
        setDisplay(sampleDisplay(NaN, null));
        return;
      }
      if (now - clock.current.updatedAt >= 1000) {
        clock.current = advanceForecast(clock.current, now, pending.current);
        pending.current = null;
      }
      const remaining = clock.current.deadline - now;
      const wallNow = Date.now();
      setDisplay((previous) => sampleDisplay(remaining, previous.completionMinute, wallNow));
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  if (!active || finishing) return null;
  const { remaining, wallNow, completionMinute } = display;
  const valid = Number.isFinite(remaining) && remaining > 0;
  const completion =
    valid && completionMinute !== null ? completionLabel(wallNow, completionMinute, locale) : null;
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
