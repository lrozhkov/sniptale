import { Skeleton } from '@sniptale/ui/skeleton';
import { POPUP_LOADING_CARD_CLASS_NAME } from './constants';

export function PopupRouteLoadingFallback() {
  return (
    <div data-ui="popup.app.route-loading" className="flex h-full flex-col gap-3">
      <section className={POPUP_LOADING_CARD_CLASS_NAME}>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton shape="block" className="h-12 w-full" />
          <Skeleton className="h-3 w-[82%]" />
          <Skeleton className="h-3 w-[68%]" />
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton shape="block" className="h-14 w-full" />
        <Skeleton shape="block" className="h-14 w-full" />
      </div>
    </div>
  );
}
