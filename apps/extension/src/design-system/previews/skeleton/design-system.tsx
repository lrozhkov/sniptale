import type { AppLocale } from '../../../platform/i18n';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import { Skeleton } from '@sniptale/ui/skeleton';

const skeletonPreviewCardClassName = [
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-4',
].join(' ');

export function buildSkeletonSharedPreviews(_locale: AppLocale): DesignSystemVariantPreview[] {
  return [
    designSystemPreview(
      'shared.ui.skeleton',
      'lines',
      <div className={`space-y-3 ${skeletonPreviewCardClassName}`}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[82%]" />
        <Skeleton className="h-3 w-[58%]" />
      </div>
    ),
    designSystemPreview(
      'shared.ui.skeleton',
      'card',
      <div className={skeletonPreviewCardClassName}>
        <div className="flex items-start gap-3">
          <Skeleton shape="circle" className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[74%]" />
          </div>
        </div>
      </div>
    ),
  ];
}
