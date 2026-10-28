import { useEffect, useMemo, useRef } from 'react';
import { Search, X, CircleDashed, List, Grid2X2, Check } from 'lucide-react';
import { replaceColorChannels } from '@sniptale/foundation/color';
import { translate } from '../../platform/i18n';
import { families, nearby, colorIdentity, type CatalogColor } from './catalog-model';
import { useNamedCatalog, useCatalogBrowsing } from './catalog-state';

const familyLabels = {
  red: 'shared.ui.colorCatalogFamilyRed',
  orange: 'shared.ui.colorCatalogFamilyOrange',
  yellow: 'shared.ui.colorCatalogFamilyYellow',
  green: 'shared.ui.colorCatalogFamilyGreen',
  cyan: 'shared.ui.colorCatalogFamilyCyan',
  blue: 'shared.ui.colorCatalogFamilyBlue',
  violet: 'shared.ui.colorCatalogFamilyViolet',
  pink: 'shared.ui.colorCatalogFamilyPink',
  neutral: 'shared.ui.colorCatalogFamilyNeutral',
} as const;
type Browsing = ReturnType<typeof useCatalogBrowsing>;
const t = (key: Parameters<typeof translate>[0]) => translate(key);

export function ColorCatalogToggle(props: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="sniptale-catalog-toggle"
      aria-pressed={props.active}
      aria-label={t('shared.ui.colorCatalogSearch')}
      title={t('shared.ui.colorCatalogSearch')}
      onClick={props.onToggle}
    >
      <Search size={16} strokeWidth={1.75} />
    </button>
  );
}

function CatalogHeader({
  state,
  loading,
  onExit,
}: {
  state: Browsing;
  loading: boolean;
  onExit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <>
      <div className="sniptale-catalog-search">
        <Search size={14} />
        <input
          ref={input}
          type="search"
          aria-label={t('shared.ui.colorCatalogSearch')}
          placeholder={t('shared.ui.colorCatalogPlaceholder')}
          spellCheck={false}
          value={state.query}
          onChange={(event) => state.changeQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              state.focus(0);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              if (state.query) state.clear();
              else onExit();
            }
          }}
        />
        {state.query && (
          <button
            type="button"
            className="sniptale-catalog-clear"
            aria-label={t('shared.ui.colorCatalogClear')}
            onClick={() => {
              state.changeQuery('');
              input.current?.focus();
            }}
          >
            <X size={12} />
          </button>
        )}
        <div
          className="sniptale-catalog-sources"
          role="group"
          aria-label={t('shared.ui.colorCatalogSource')}
        >
          {(['all', 'css'] as const).map((source) => (
            <button
              key={source}
              type="button"
              aria-pressed={state.source === source}
              onClick={() => state.changeSource(source)}
            >
              {source === 'all' ? t('shared.ui.colorCatalogAll') : 'CSS'}
            </button>
          ))}
        </div>
      </div>
      <div className="sniptale-catalog-family-row">
        <div
          className="sniptale-catalog-families"
          role="group"
          aria-label={t('shared.ui.colorCatalogFamilies')}
        >
          <button
            type="button"
            className="sniptale-catalog-family"
            aria-label={t('shared.ui.colorCatalogGroupsAll')}
            title={t('shared.ui.colorCatalogGroupsAll')}
            aria-pressed={state.group === 'all'}
            onClick={() => state.changeGroup('all')}
          >
            <CircleDashed size={12} />
          </button>
          {families.map((family) => (
            <button
              key={family.id}
              type="button"
              className="sniptale-catalog-family"
              aria-label={t(familyLabels[family.id])}
              title={t(familyLabels[family.id])}
              aria-pressed={state.group === family.id}
              onClick={() => state.changeGroup(family.id)}
            >
              <span style={{ background: family.hex }} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sniptale-catalog-count"
          onClick={state.toggleExpanded}
          disabled={Boolean(state.query)}
          aria-label={t(
            state.expanded ? 'shared.ui.colorCatalogOverview' : 'shared.ui.colorCatalogAllShades'
          )}
          title={t(
            state.expanded ? 'shared.ui.colorCatalogOverview' : 'shared.ui.colorCatalogAllShades'
          )}
        >
          <span role="status" aria-label={loading ? t('shared.ui.colorCatalogLoading') : undefined}>
            {loading ? '…' : state.results.length.toLocaleString()}
          </span>
          {state.expanded ? <Grid2X2 size={11} /> : <List size={11} />}
        </button>
      </div>
    </>
  );
}

function CatalogGrid({
  state,
  color,
  choose,
  loading,
}: {
  state: Browsing;
  loading: boolean;
  color: string;
  choose: (color: CatalogColor) => void;
}) {
  const empty = state.results.length === 0;
  return (
    <div
      ref={state.grid}
      className={`sniptale-catalog-grid ${empty || loading ? 'is-empty' : ''}`}
      aria-busy={loading}
      role="group"
      aria-label={t('shared.ui.colorCatalogSource')}
      onPointerLeave={() => state.setHover(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) state.setHover(null);
      }}
      onScroll={(event) => state.setScrollTop(event.currentTarget.scrollTop)}
    >
      {loading ? (
        <div className="sniptale-catalog-empty" role="status">
          {t('shared.ui.colorCatalogLoading')}
        </div>
      ) : empty ? (
        <div className="sniptale-catalog-empty">
          <strong>{t('shared.ui.colorCatalogEmpty')}</strong>
          <span>{t('shared.ui.colorCatalogEmptyHint')}</span>
          <button type="button" onClick={state.clear}>
            {t('shared.ui.colorCatalogReset')}
          </button>
        </div>
      ) : (
        <div
          style={{
            height: Math.max(0, Math.ceil(state.board.length / 8) * 26 - 2),
            position: 'relative',
          }}
        >
          <div className="sniptale-catalog-tiles" style={{ top: Math.floor(state.start / 8) * 26 }}>
            {state.board.slice(state.start, state.end).map((entry, offset) => {
              const index = state.start + offset;
              return (
                <button
                  key={`${entry.source}:${entry.name}`}
                  type="button"
                  data-color-index={index}
                  style={{ background: entry.hex }}
                  title={`${entry.name} · ${entry.hex.toUpperCase()}`}
                  aria-label={`${entry.name} · ${entry.hex.toUpperCase()}`}
                  aria-pressed={entry.hex === colorIdentity(color)}
                  tabIndex={
                    index === Math.max(state.start, Math.min(state.end - 1, state.active)) ? 0 : -1
                  }
                  onPointerEnter={() => state.setHover(entry)}
                  onFocus={() => {
                    state.setActive(index);
                    state.setHover(entry);
                  }}
                  onClick={() => choose(entry)}
                  onKeyDown={(event) => {
                    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[
                      event.key
                    ];
                    if (delta !== undefined) {
                      event.preventDefault();
                      state.focus(index + delta);
                    }
                  }}
                >
                  {entry.hex === colorIdentity(color) ? <Check size={12} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ColorCatalogPanel(props: {
  color: string;
  onColorChange: (color: string) => void;
  onExit: () => void;
}) {
  const catalog = useNamedCatalog();
  const state = useCatalogBrowsing(catalog.colors);
  const loading = catalog.status === 'loading' && state.source === 'all';
  const hex = colorIdentity(props.color) ?? '#000000';
  const neighbors = useMemo(() => nearby([...state.pool], hex), [state.pool, hex]);
  const selected = state.pool.find((color) => color.hex === hex);
  const preview = state.hover ??
    selected ?? { name: t('shared.ui.colorCatalogCurrent'), hex, source: 'names' };
  const choose = (color: CatalogColor) => {
    props.onColorChange(replaceColorChannels(props.color, color.hex) ?? color.hex);
    state.setHover(color);
  };
  return (
    <div className="sniptale-color-catalog" data-ui="shared.ui.color-selector.catalog">
      <CatalogHeader state={state} loading={loading} onExit={props.onExit} />
      <CatalogGrid state={state} loading={loading} color={props.color} choose={choose} />
      {catalog.status === 'failed' && (
        <button className="sniptale-catalog-retry" type="button" onClick={catalog.retry}>
          {t('shared.ui.colorCatalogRetry')}
        </button>
      )}
      <div className="sniptale-catalog-inspect">
        <span className="sniptale-catalog-chip" style={{ background: preview.hex }} />
        <span className="sniptale-catalog-title">
          <strong title={preview.name}>{preview.name}</strong>
          <span>
            {preview.hex.toUpperCase()} · {preview.source === 'css' ? 'CSS' : 'Color Names'}
          </span>
        </span>
        {catalog.status === 'loading' && (
          <span className="sr-only" role="status">
            {t('shared.ui.colorCatalogLoading')}
          </span>
        )}
      </div>
      <div
        className="sniptale-catalog-nearby"
        role="group"
        aria-label={t('shared.ui.colorCatalogNearbyLabel')}
        onPointerLeave={() => state.setHover(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) state.setHover(null);
        }}
      >
        <span>{t('shared.ui.colorCatalogNearby')}</span>
        {neighbors.map((color) => (
          <button
            key={color.hex}
            type="button"
            style={{ background: color.hex }}
            title={`${color.name} · ${color.hex.toUpperCase()}`}
            aria-label={`${color.name} · ${color.hex.toUpperCase()}`}
            onPointerEnter={() => state.setHover(color)}
            onFocus={() => state.setHover(color)}
            onClick={() => choose(color)}
          />
        ))}
      </div>
    </div>
  );
}
