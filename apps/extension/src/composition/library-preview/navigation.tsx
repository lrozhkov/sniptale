import { useState } from 'react';
import { Film, Image, Library } from 'lucide-react';
import { translate, type Translate } from '../../platform/i18n';
import type { GallerySavedView } from '../persistence/gallery-saved-views';
type LibraryNavigationProps = {
  category: 'all' | 'video' | 'image';
  presetId: string | null;
  savedViews: GallerySavedView[];
  onCategoryChange(category: 'all' | 'video' | 'image'): void;
  onPresetChange(id: string, category: 'all' | 'video' | 'image'): void;
  label?: string;
  t?: Translate;
};
/** Shared library categories keep saved filters beneath their matching media type. */
export function LibraryNavigation(props: LibraryNavigationProps) {
  return (
    <nav
      className="library-navigation min-h-0 min-w-0 space-y-1 overflow-y-auto"
      aria-label={props.label ?? (props.t ?? translate)('videoEditor.app.libraryTitle')}
    >
      {(['all', 'image', 'video'] as const).map((category) => (
        <LibraryCategory key={category} {...props} categoryKey={category} />
      ))}
    </nav>
  );
}
function libraryNavigationClass(active: boolean): string {
  return [
    'flex h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-sm',
    'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-panel)]',
    active ? 'bg-[var(--sniptale-color-surface-panel)] font-medium' : '',
  ].join(' ');
}

function LibraryCategory(
  props: LibraryNavigationProps & { categoryKey: 'all' | 'video' | 'image' }
) {
  const t = props.t ?? translate;
  const [visibleCount, setVisibleCount] = useState(5);
  const category = props.categoryKey;
  const Icon = category === 'all' ? Library : category === 'video' ? Film : Image;
  const views = props.savedViews.filter(
    (view) =>
      view.folderFilter ===
      (category === 'all' ? 'all' : category === 'video' ? 'recording' : 'screenshot')
  );
  const active = props.category === category;
  return (
    <div>
      <button
        type="button"
        aria-pressed={active && props.presetId === null}
        onClick={() => props.onCategoryChange(category)}
        className={libraryNavigationClass(active && props.presetId === null)}
      >
        <Icon size={16} aria-hidden />
        {t(
          category === 'all'
            ? 'gallery.preview.folderAll'
            : category === 'video'
              ? 'videoEditor.app.materialsVideo'
              : 'scenario.editor.guideLibraryImages'
        )}
      </button>
      <div className="space-y-0.5 pl-7" data-ui={`library-filters-${category}`}>
        {views.slice(0, visibleCount).map((view) => (
          <button
            key={view.id}
            type="button"
            title={view.name}
            aria-pressed={active && props.presetId === view.id}
            onClick={() => props.onPresetChange(view.id, category)}
            className={`${libraryNavigationClass(active && props.presetId === view.id)} !h-8 !px-2 !text-xs`}
          >
            <span className="truncate">{view.name}</span>
          </button>
        ))}
        {visibleCount < views.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 5)}
            className="h-8 w-full cursor-pointer px-2 text-left text-xs text-[var(--sniptale-color-accent-emphasis)]"
          >
            {t('gallery.app.savedViewShowMore')}
          </button>
        )}
      </div>
    </div>
  );
}
