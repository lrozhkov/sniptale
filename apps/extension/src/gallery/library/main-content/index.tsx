import { GalleryGrid } from './grid';
import { GalleryHeaderBanner } from './header';
import { GallerySelectionBar } from './selection-bar';
import type { GalleryMainContentProps } from './types';

const mainContentBackground =
  'radial-gradient(circle_at_top, color-mix(in_srgb,var(--sniptale-color-surface-panel)_34%,white_4%), ' +
  'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_92%,transparent)_36%, ' +
  'var(--sniptale-color-surface-canvas)_100%)';

export function GalleryMainContent(props: GalleryMainContentProps) {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: mainContentBackground,
        }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col px-5 py-5">
        {props.banner ? (
          <div className="shrink-0 pb-3">
            <GalleryHeaderBanner
              banner={props.banner}
              onBannerDismiss={props.onBannerDismiss}
              onStorageManagerOpen={props.onStorageManagerOpen}
            />
          </div>
        ) : null}
        {props.children}
        <GallerySelectionBar {...props} />
        <GalleryGrid {...props} />
      </div>
    </main>
  );
}
