import { useState } from 'react';
import { Film, Image, Library, Music } from 'lucide-react';
import { translate, type Translate } from '../../platform/i18n';
import type { GallerySavedView } from '../persistence/gallery-saved-views';
type Category = 'all' | 'video' | 'image';
type LibraryNavigationProps = {
  presetId: string | null;
  savedViews: GallerySavedView[];
  label?: string;
  showAllIcon?: boolean;
  t?: Translate;
} & (
  | {
      includeAudio: true;
      category: Category | 'audio';
      onCategoryChange(category: Category | 'audio'): void;
      onPresetChange(id: string, category: Category | 'audio'): void;
    }
  | {
      includeAudio?: false;
      category: Category;
      onCategoryChange(category: Category): void;
      onPresetChange(id: string, category: Category): void;
    }
);
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
      {props.includeAudio && <LibraryCategory {...props} categoryKey="audio" />}
    </nav>
  );
}
function libraryNavigationClass(active: boolean): string {
  return [
    'flex h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm',
    'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-panel)]',
    active ? 'bg-[var(--sniptale-color-surface-panel)] font-medium' : '',
  ].join(' ');
}

const categories = {
  all: { Icon: Library, folder: 'all', labelKey: 'gallery.preview.folderAll' },
  video: { Icon: Film, folder: 'recording', labelKey: 'videoEditor.app.materialsVideo' },
  image: { Icon: Image, folder: 'screenshot', labelKey: 'scenario.editor.guideLibraryImages' },
  audio: { Icon: Music, folder: 'audio', labelKey: 'videoEditor.app.materialsAudio' },
} as const;

function LibraryCategory(props: LibraryNavigationProps & { categoryKey: Category | 'audio' }) {
  const t = props.t ?? translate;
  const [visibleCount, setVisibleCount] = useState(5);
  const category = props.categoryKey;
  const { Icon, folder, labelKey } = categories[category];
  const views = props.savedViews.filter((view) => view.folderFilter === folder);
  const active = props.category === category;
  return (
    <div>
      <button
        type="button"
        aria-pressed={active && props.presetId === null}
        onClick={() => {
          if (category === 'audio') {
            if (props.includeAudio) props.onCategoryChange('audio');
          } else props.onCategoryChange(category);
        }}
        className={libraryNavigationClass(active && props.presetId === null)}
      >
        {category === 'all' && props.showAllIcon === false ? (
          <span className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Icon size={16} className="shrink-0" aria-hidden />
        )}
        {t(labelKey)}
      </button>
      <div className="space-y-0.5 pl-7" data-ui={`library-filters-${category}`}>
        {views.slice(0, visibleCount).map((view) => (
          <button
            key={view.id}
            type="button"
            title={view.name}
            aria-pressed={active && props.presetId === view.id}
            onClick={() => {
              if (category === 'audio') {
                if (props.includeAudio) props.onPresetChange(view.id, 'audio');
              } else props.onPresetChange(view.id, category);
            }}
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
