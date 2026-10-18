import { Library, LoaderCircle } from 'lucide-react';
import { translate } from '../../../platform/i18n';

export function GalleryLoadingPanel({ checking = false }: { checking?: boolean }) {
  return (
    <main
      data-ui="gallery.loading"
      aria-busy="true"
      className="sniptale-compact-workspace flex min-h-screen items-center justify-center
        bg-[var(--sniptale-color-surface-canvas)] p-6"
    >
      <section
        role="status"
        className="max-w-md text-center text-[var(--sniptale-color-text-primary)]"
      >
        <Library className="mx-auto mb-4 h-8 w-8" aria-hidden="true" />
        <h1 className="text-sm leading-5 font-semibold">{translate('gallery.app.loading')}</h1>
        <p className="mt-2 text-sm leading-5 text-[var(--sniptale-color-text-muted)]">
          {checking ? translate('gallery.recovery.checkingTitle') : null}
        </p>
        <LoaderCircle
          className="mx-auto mt-4 h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      </section>
    </main>
  );
}
