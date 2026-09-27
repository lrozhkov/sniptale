import { useEffect, useRef, useState } from 'react';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  createContextMenuLayout,
  createRecommendedContextMenuSettings,
  parseContextMenuLayout,
  type ContextMenuItemKey,
  type ContextMenuLayout,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate } from '../../../../../platform/i18n';
import type { AppearanceSectionState } from './types';

const buttonClass = [
  'rounded-lg px-3 py-2 text-sm hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)] disabled:opacity-45',
].join(' ');

type Section = ContextMenuLayout['sections'][number];

function reorder<T>(items: T[], index: number, offset: number): T[] {
  const next = [...items];
  const item = next[index];
  if (item === undefined || index + offset < 0 || index + offset >= next.length) return next;
  next.splice(index, 1);
  next.splice(index + offset, 0, item);
  return next;
}

/** Disposable menu draft; only explicit Save writes through the settings controller. */
export function ContextMenuEditor({
  state,
  onClose,
}: {
  state: Pick<
    AppearanceSectionState,
    'contextMenu' | 'contextMenuOptions' | 'locale' | 'updateContextMenu'
  >;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(() => ({
    ...state.contextMenu,
    layout: structuredClone(state.contextMenu.layout ?? createContextMenuLayout()),
  }));
  const [status, setStatus] = useState<'editing' | 'saving' | 'failed'>('editing');
  const saving = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const focusAfterChange = useRef<ContextMenuItemKey | 'heading' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = null;
    if (target === 'heading') heading.current?.focus();
    else if (target)
      surface.current
        ?.querySelector<HTMLButtonElement>(`[data-menu-item="${target}"] button`)
        ?.focus();
  }, [draft]);
  const changeDraft = (next: MenuDraft, focus?: ContextMenuItemKey | 'heading') => {
    focusAfterChange.current = focus ?? null;
    setDraft(next);
  };
  const t = (key: Parameters<typeof translate>[0]) => translate(key, state.locale);
  const sections = draft.layout.sections;
  const changeSections = (next: Section[]) =>
    setDraft((current) => ({ ...current, layout: { version: 1, sections: next } }));
  const save = async () => {
    if (saving.current || !parseContextMenuLayout(draft.layout)) return;
    saving.current = true;
    setStatus('saving');
    try {
      await state.updateContextMenu(draft);
      onClose();
    } catch {
      setStatus('failed');
    } finally {
      saving.current = false;
    }
  };
  return (
    <div
      ref={surface}
      className="max-w-[40rem] space-y-3 text-[var(--sniptale-color-text-primary)]"
    >
      <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold">
        {t('settings.appearance.contextMenuTitle')}
      </h2>
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {t('settings.appearance.contextMenuEditorHelp')}
      </p>
      <fieldset disabled={status === 'saving'} className="min-w-0 space-y-3">
        {sections.map((section, sectionIndex) => (
          <ContextMenuSection
            key={section.id}
            section={section}
            sectionIndex={sectionIndex}
            draft={draft}
            onChange={changeDraft}
            locale={state.locale}
            options={state.contextMenuOptions}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={sections.length >= 10}
            onClick={() => {
              let id = 1;
              while (sections.some((section) => section.id === `section-${id}`)) id += 1;
              changeSections([
                ...sections,
                {
                  id: `section-${id}`,
                  title: t('settings.appearance.contextMenuNewSection'),
                  items: [],
                },
              ]);
            }}
          >
            {t('settings.appearance.contextMenuAddSection')}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              setDraft({
                ...createRecommendedContextMenuSettings(),
                enabled: draft.enabled,
                layout: createContextMenuLayout(),
              })
            }
          >
            {t('settings.appearance.contextMenuRestore')}
          </button>
        </div>
        {!parseContextMenuLayout(draft.layout) && (
          <p role="alert" className="text-sm">
            {t('settings.appearance.contextMenuInvalidName')}
          </p>
        )}
        <p role={status === 'failed' ? 'alert' : 'status'} className="text-sm">
          {t(
            status === 'failed'
              ? 'settings.appearance.contextMenuSaveFailed'
              : status === 'saving'
                ? 'settings.appearance.contextMenuSaving'
                : 'settings.appearance.contextMenuUnsaved'
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!parseContextMenuLayout(draft.layout)}
            onClick={() => {
              void save();
            }}
          >
            {t('settings.appearance.contextMenuSave')}
          </button>
          <button type="button" className={buttonClass} onClick={onClose}>
            {t('settings.appearance.contextMenuCancel')}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

type MenuDraft = AppearanceSectionState['contextMenu'] & { layout: ContextMenuLayout };

function ContextMenuSection({
  section,
  sectionIndex,
  draft,
  onChange,
  locale,
  options,
}: {
  section: Section;
  sectionIndex: number;
  draft: MenuDraft;
  onChange(next: MenuDraft, focus?: ContextMenuItemKey | 'heading'): void;
  locale: AppearanceSectionState['locale'];
  options: AppearanceSectionState['contextMenuOptions'];
}) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const sections = draft.layout.sections;
  const rootLabel = t('settings.appearance.contextMenuRoot');
  const sectionLabel = (section: Section) => (section.id === 'root' ? rootLabel : section.title);
  const changeSections = (next: Section[], focus?: ContextMenuItemKey | 'heading') =>
    onChange({ ...draft, layout: { version: 1, sections: next } }, focus);
  const moveItem = (key: ContextMenuItemKey, destination: string) =>
    changeSections(
      sections.map((section) => ({
        ...section,
        items:
          section.id === destination
            ? [...section.items, key]
            : section.items.filter((item) => item !== key),
      })),
      key
    );
  return (
    <section
      key={section.id}
      className="rounded-lg border border-[var(--sniptale-color-border-soft)] p-3"
      aria-label={sectionLabel(section)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {section.id === 'root' ? (
          <h3 className="text-sm font-semibold">{rootLabel}</h3>
        ) : (
          <ProductInput
            aria-label={t('settings.appearance.contextMenuSectionName')}
            value={section.title}
            maxLength={40}
            onChange={(event) =>
              changeSections(
                sections.map((entry) =>
                  entry.id === section.id ? { ...entry, title: event.target.value } : entry
                )
              )
            }
          />
        )}
        <MoveButtons
          locale={locale}
          label={sectionLabel(section)}
          index={sectionIndex}
          count={sections.length}
          onMove={(offset) => changeSections(reorder(sections, sectionIndex, offset))}
        />
        {section.id !== 'root' && (
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              changeSections(
                sections
                  .filter((entry) => entry.id !== section.id)
                  .map((entry) =>
                    entry.id === 'root'
                      ? { ...entry, items: [...entry.items, ...section.items] }
                      : entry
                  )
              )
            }
          >
            {t('settings.appearance.contextMenuRemoveSection')}
          </button>
        )}
      </div>
      {section.items.map((key, itemIndex) => {
        const label = options.find((option) => option.key === key)?.label ?? key;
        return (
          <div key={key} data-menu-item={key} className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={() => onChange({ ...draft, [key]: !draft[key] })}
              />
              {label}
            </label>
            <div className="w-40">
              <ProductSelect
                aria-label={`${t('settings.appearance.contextMenuSection')}: ${label}`}
                value={section.id}
                options={sections.map((entry) => ({
                  value: entry.id,
                  label: sectionLabel(entry),
                }))}
                onChange={(destination) => {
                  if (destination !== section.id) moveItem(key, destination);
                }}
              />
            </div>
            <MoveButtons
              locale={locale}
              label={label}
              index={itemIndex}
              count={section.items.length}
              onMove={(offset) =>
                changeSections(
                  sections.map((entry) =>
                    entry.id === section.id
                      ? { ...entry, items: reorder(entry.items, itemIndex, offset) }
                      : entry
                  )
                )
              }
            />
          </div>
        );
      })}
    </section>
  );
}

function MoveButtons({
  locale,
  label,
  index,
  count,
  onMove,
}: {
  locale: AppearanceSectionState['locale'];
  label: string;
  index: number;
  count: number;
  onMove(offset: number): void;
}) {
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        disabled={index === 0}
        aria-label={`${translate('settings.appearance.contextMenuUp', locale)}: ${label}`}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={index === count - 1}
        aria-label={`${translate('settings.appearance.contextMenuDown', locale)}: ${label}`}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
    </>
  );
}
