import { GalleryGrid } from './grid';
import { GalleryHeaderBanner } from './header';
import type { GalleryMainContentProps } from './types';

export function GalleryMainContent(props: GalleryMainContentProps) {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {props.banner ? (
        <div className="shrink-0 pb-3">
          <GalleryHeaderBanner banner={props.banner} onBannerDismiss={props.onBannerDismiss} />
        </div>
      ) : null}
      {props.children}
      <GalleryGrid {...props} />
    </main>
  );
}
