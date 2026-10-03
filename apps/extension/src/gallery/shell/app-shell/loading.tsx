import { Library, LoaderCircle } from 'lucide-react';
import { translate } from '../../../platform/i18n';

export function GalleryLoadingPanel({ checking = false }: { checking?: boolean }) {
  return (
    <main
      data-ui="gallery.loading"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-[var(--sniptale-color-surface-canvas)] p-6"
    >
      <section
        role="status"
        className="max-w-md text-center text-[var(--sniptale-color-text-primary)]"
      >
        <Library className="mx-auto mb-4 h-8 w-8" aria-hidden="true" />
        <h1 className="text-xl font-semibold">{translate('gallery.app.loading')}</h1>
        <p className="mt-3 min-h-6 text-sm leading-6 text-[var(--sniptale-color-text-muted)]">
          {checking ? translate('gallery.recovery.checkingTitle') : null}
        </p>
        <LoaderCircle
          className="mx-auto mt-5 h-5 w-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      </section>
    </main>
  );
}
