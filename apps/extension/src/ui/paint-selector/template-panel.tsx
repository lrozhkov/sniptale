import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent,
} from 'react';
import {
  arePaintsEqual,
  serializePaintToCss,
  type Gradient,
  type GradientType,
} from '@sniptale/foundation/paint';
import { Check, Ellipsis, Grid2X2, List, Settings2 } from 'lucide-react';
import type { GradientTemplateResources } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { translate } from '../../platform/i18n';
import { CompactSelect } from '../compact-inspector-controls';
import { GradientTemplateSave } from './template-save';

const COMMAND_CLASS = [
  'grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[4px]',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'aria-pressed:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline',
  'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

type Template = GradientTemplateResources['presets'][number];
type CatalogView = 'list' | 'grid';
type TemplateCommand = { id: string; kind: 'menu' | 'rename' } | null;

const CHECKERBOARD = 'conic-gradient(#c4c4c4 25%, #eee 0 50%, #c4c4c4 0 75%, #eee 0)';
const ROW_STYLES = {
  grid: {
    select: [
      'absolute inset-0 cursor-pointer rounded-[3px] outline-none focus-visible:outline focus-visible:outline-1',
      'focus-visible:outline-[var(--sniptale-color-text-primary)]',
    ].join(' '),
    check: [
      'pointer-events-none absolute left-0.5 top-0.5 grid h-[18px] w-[18px] place-items-center',
      'rounded-[3px] bg-[var(--sniptale-color-surface-panel)]',
    ].join(' '),
    actions: [
      'pointer-events-none absolute right-0.5 top-0.5 flex gap-0.5 opacity-0',
      'group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto',
      'group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto',
      '[@media(hover:none)]:opacity-100',
    ].join(' '),
    command: [
      '!h-5 !w-5 !bg-[color:rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
      '[@media(pointer:coarse)]:!h-6',
      '[@media(pointer:coarse)]:!w-6',
    ].join(' '),
    row: 'h-11',
    active: 'outline outline-1 outline-offset-2 outline-[var(--sniptale-color-text-secondary)]',
    iconSize: 10,
  },
  list: {
    select: [
      'flex h-[30px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[4px] p-0.5 text-left outline-none',
      'focus-visible:outline focus-visible:outline-1',
      'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
    ].join(' '),
    check: 'pointer-events-none grid h-[18px] w-[18px] shrink-0 place-items-center',
    actions: 'flex shrink-0',
    command: '!h-6 !w-6',
    row: 'flex h-[34px] items-center gap-1 p-0.5',
    active: 'bg-[var(--sniptale-color-surface-hover)]',
    iconSize: 12,
  },
};

function TemplateResourceRow(props: {
  template: Template;
  view: CatalogView;
  active: boolean;
  expanded: boolean;
  onSelect: (gradient: Gradient) => void;
  onCopy: (gradient: Gradient) => void;
  onManage: (anchor: HTMLButtonElement) => void;
}) {
  const { template, view, active } = props;
  const appearance = ROW_STYLES[view];
  const preview = {
    backgroundImage: [
      serializePaintToCss({ kind: 'gradient', gradient: template.gradient }),
      CHECKERBOARD,
    ].join(', '),
    backgroundSize: '100% 100%, 12px 12px',
  };
  return (
    <div
      data-preset-id={template.id}
      className={[
        'group relative min-w-0 rounded-[4px]',
        appearance.row,
        active ? appearance.active : '',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label={template.name}
        title={template.name}
        data-popup-hint={template.name}
        aria-pressed={active}
        className={appearance.select}
        style={view === 'grid' ? preview : undefined}
        onClick={() => props.onSelect(structuredClone(template.gradient))}
      >
        {view === 'list' ? (
          <>
            <span aria-hidden="true" className="h-6 w-10 shrink-0 rounded-[3px]" style={preview} />
            <span className="truncate text-xs leading-4">{template.name}</span>
          </>
        ) : null}
      </button>
      {active ? (
        <span aria-hidden="true" className={appearance.check}>
          <Check size={12} strokeWidth={1.75} />
        </span>
      ) : null}
      <div className={appearance.actions}>
        <button
          type="button"
          className={`${COMMAND_CLASS} ${appearance.command}`}

          aria-label={`${translate('highlighter.paintPicker.configureTemplate')}: ${template.name}`}
          onClick={() =>
            props.onCopy({
              ...structuredClone(template.gradient),
              stops: template.gradient.stops.map((stop) => ({
                ...stop,
                id: `stop-${crypto.randomUUID()}`,
              })),
            })
          }
        >
          <Settings2 size={appearance.iconSize} strokeWidth={1.75} />
        </button>
        {template.origin === 'user' ? (
          <button
            type="button"
            className={`${COMMAND_CLASS} ${appearance.command}`}

            aria-label={`${translate('highlighter.paintPicker.templateActions')}: ${template.name}`}
            aria-expanded={props.expanded}
            onClick={(event) => props.onManage(event.currentTarget)}
          >
            <Ellipsis size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TemplateCatalogTools(props: {
  search: RefObject<HTMLInputElement | null>;
  query: string;
  type: 'all' | GradientType;
  view: CatalogView;
  allowedModes?: readonly ('solid' | GradientType)[];
  onQuery: (value: string) => void;
  onType: (value: 'all' | GradientType) => void;
  onView: (value: CatalogView) => void;
}) {
  return (
    <div
      className={[
        'grid shrink-0 grid-cols-[minmax(0,1fr)_116px_auto] items-center gap-1.5',
        'max-[680px]:grid-cols-[minmax(0,1fr)_auto]',
      ].join(' ')}
    >
      <input
        ref={props.search}
        type="search"
        aria-label={translate('highlighter.paintPicker.searchTemplates')}
        placeholder={translate('highlighter.paintPicker.searchTemplates')}
        value={props.query}
        onChange={(event) => props.onQuery(event.target.value)}
        className={[
          'h-7 min-w-0 rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-input)] px-2 text-xs outline-none focus-visible:outline',
          'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      />
      <div className="min-w-0 max-[680px]:col-span-2 max-[680px]:row-start-2">
        <CompactSelect<'all' | GradientType>
          aria-label={translate('highlighter.paintPicker.filterTemplates')}
          value={props.type}
          onChange={props.onType}
          className="sniptale-picker-select h-7! min-h-7! rounded-[4px]! px-2! text-xs! font-normal!"
          menuClassName="sniptale-picker-select-menu"
          options={[
            { value: 'all', label: translate('highlighter.paintPicker.allTemplateTypes') },
            ...(['linear', 'radial', 'conic'] as const)
              .filter((value) => props.allowedModes?.includes(value) ?? true)
              .map((value) => ({ value, label: translate(`highlighter.paintPicker.${value}`) })),
          ]}
        />
      </div>
      <div className="flex gap-0.5 max-[680px]:col-start-2 max-[680px]:row-start-1">
        <button
          type="button"
          className={COMMAND_CLASS}
          aria-label={translate('highlighter.paintPicker.templateList')}
          aria-pressed={props.view === 'list'}
          onClick={() => props.onView('list')}
        >
          <List size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={COMMAND_CLASS}
          aria-label={translate('highlighter.paintPicker.templateGrid')}
          aria-pressed={props.view === 'grid'}
          onClick={() => props.onView('grid')}
        >
          <Grid2X2 size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function handleResourceMenuKey(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    const tree = event.currentTarget.getRootNode();
    const active =
      tree instanceof ShadowRoot
        ? tree.activeElement
        : event.currentTarget.ownerDocument.activeElement;
    const index = buttons.findIndex((button) => button === active);
    buttons[
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    ]?.focus();
  }
}

function TemplateActionChoices(props: {
  name: string;
  confirmDelete: boolean;
  busy: boolean;
  onRename: () => void;
  onConfirm: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {!props.confirmDelete ? (
        <div className="grid gap-0.5">
          <button
            type="button"
            role="menuitem"
            className={[
              'h-8 rounded-[4px] px-2 text-left text-xs outline-none focus-visible:outline',
              'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
            ].join(' ')}
            onClick={props.onRename}
          >
            {translate('highlighter.paintPicker.renameTemplate')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={[
              'h-8 rounded-[4px] px-2 text-left text-xs outline-none focus-visible:outline',
              'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
            ].join(' ')}
            onClick={() => props.onConfirm()}
          >
            {translate('highlighter.paintPicker.deleteTemplate')}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            props.onDelete();
          }}
        >
          <p className="mx-1 mb-2 mt-1 break-words text-xs">
            {translate('highlighter.paintPicker.deleteTemplateConfirm')} «{props.name}»
          </p>
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className={[
                'h-8 rounded-[4px] px-2 text-xs outline-none focus-visible:outline focus-visible:outline-1',
                'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
              ].join(' ')}
              onClick={props.onClose}
            >
              {translate('highlighter.paintPicker.cancelTemplate')}
            </button>
            <button
              type="submit"
              aria-busy={props.busy}
              className={[
                'h-8 cursor-pointer rounded-[4px] bg-[var(--sniptale-color-surface-hover)] px-2 text-xs',
                'outline-none focus-visible:outline focus-visible:outline-1',
                'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
              ].join(' ')}
            >
              {translate('highlighter.paintPicker.deleteTemplate')}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function TemplateResourceActions(props: {
  preset: Template;
  anchor: HTMLButtonElement;
  resources: GradientTemplateResources;
  onClose: () => void;
  onRename: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const menu = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    const node = menu.current;
    const anchor = props.anchor;
    if (!node || !anchor) return;
    const view = node.ownerDocument.defaultView;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const right = (view?.innerWidth ?? 1280) - bounds.width - 8;
      node.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, right))}px`;
      node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, (view?.innerHeight ?? 900) - bounds.height - 8))}px`;
    };
    node.showPopover?.();
    position();
    node
      .querySelector<HTMLButtonElement>(confirmDelete ? 'button[type="button"]' : 'button')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.composedPath().includes(node) || event.composedPath().includes(anchor)) return;
      if (!pending.current) {
        latest.current.onClose();
      }
    };
    node.ownerDocument.addEventListener('pointerdown', dismiss, true);
    node.ownerDocument.addEventListener('scroll', position, true);
    view?.addEventListener('resize', position);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(node);
    return () => {
      node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
      node.ownerDocument.removeEventListener('scroll', position, true);
      view?.removeEventListener('resize', position);
      observer?.disconnect();
      node.hidePopover?.();
    };
  }, [confirmDelete, props.anchor, props.preset.id]);

  const close = () => {
    if (!pending.current) props.onClose();
  };
  const remove = () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    void props.resources.actions
      .onDelete(props.preset.id)
      .then((accepted) => {
        if (!mounted.current) return;
        if (accepted) props.onClose();
        else setFailed(true);
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      })
      .finally(() => {
        pending.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  return (
    <div
      ref={menu}
      popover="manual"
      role={!confirmDelete ? 'menu' : 'dialog'}
      aria-label={props.preset.name}
      data-picker-local-layer
      data-ui="shared.ui.paint-selector.template-command"
      style={{
        position: 'fixed',
        inset: 'auto',
        margin: 0,
        maxWidth: 'min(280px, calc(100vw - 16px))',
      }}
      className={[
        'rounded-[4px] border-0 bg-[var(--sniptale-color-surface-panel)] p-[5px] text-xs leading-4',
        'text-[var(--sniptale-color-text-primary)] shadow-[0_6px_24px_#0004]',
      ].join(' ')}
      onKeyDown={(event) => handleResourceMenuKey(event, close)}
    >
      <TemplateActionChoices
        name={props.preset.name}
        confirmDelete={confirmDelete}
        busy={busy}
        onRename={props.onRename}
        onConfirm={() => setConfirmDelete(true)}
        onDelete={remove}
        onClose={close}
      />
      {failed ? (
        <p role="alert" className="mx-1 mb-1 mt-1.5 text-xs text-[var(--sniptale-color-danger)]">
          {translate('highlighter.paintPicker.templateSaveError')}
        </p>
      ) : null}
    </div>
  );
}

export function GradientTemplatePanel(props: {
  activeGradient?: Gradient;
  allowedModes?: readonly ('solid' | GradientType)[];
  resources: GradientTemplateResources;
  onCopy: (gradient: Gradient) => void;
  onSelect: (gradient: Gradient) => void;
}) {
  const [view, setView] = useState<CatalogView>('list');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | GradientType>('all');
  const [command, setCommand] = useState<TemplateCommand>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const templates = props.resources.presets.filter(
    (preset) =>
      preset.enabled &&
      (props.allowedModes?.includes(preset.gradient.type) ?? true) &&
      (type === 'all' || preset.gradient.type === type) &&
      preset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const selected = props.resources.presets.find(
    (preset) => preset.id === command?.id && preset.origin === 'user'
  );
  const close = () => {
    setCommand(null);
    if (origin.current?.isConnected) origin.current.focus();
    else search.current?.focus();
  };
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      data-ui="shared.ui.paint-selector.templates"
    >
      <TemplateCatalogTools
        search={search}
        view={view}
        query={query}
        type={type}
        {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
        onView={setView}
        onQuery={setQuery}
        onType={setType}
      />
      <div className="relative min-h-0 flex-1">
        <div
          className={
            view === 'grid'
              ? [
                  'grid max-h-full grid-cols-[repeat(auto-fill,minmax(64px,1fr))] content-start gap-1.5',
                  'overflow-y-auto overscroll-contain pr-[3px]',
                ].join(' ')
              : 'grid max-h-full content-start gap-0.5 overflow-y-auto overscroll-contain pr-[3px]'
          }
          style={{ maxHeight: '100%' }}
          data-ui="shared.ui.paint-selector.template-scroll"
        >
          {templates.length === 0 ? (
            <p
              className="col-span-full px-2 py-4 text-center text-xs text-[var(--sniptale-color-text-secondary)]"
              data-ui="shared.ui.paint-selector.templates-empty"
            >
              {translate(
                query
                  ? 'highlighter.paintPicker.noMatchingTemplates'
                  : 'highlighter.paintPicker.presetsEmpty'
              )}
            </p>
          ) : null}
          {templates.map((template) => (
            <TemplateResourceRow
              key={template.id}
              template={template}
              view={view}
              active={
                props.activeGradient !== undefined &&
                arePaintsEqual(
                  { kind: 'gradient', gradient: props.activeGradient },
                  { kind: 'gradient', gradient: template.gradient }
                )
              }
              expanded={command?.id === template.id}
              onSelect={props.onSelect}
              onCopy={props.onCopy}
              onManage={(anchor) => {
                if (command) return;
                origin.current = anchor;
                setCommand({ id: template.id, kind: 'menu' });
              }}
            />
          ))}
        </div>
        {selected && command?.kind === 'rename' ? (
          <GradientTemplateSave
            key={selected.id}
            anchor={origin.current}
            gradient={selected.gradient}
            resources={props.resources}
            presetId={selected.id}
            initialName={selected.name}
            onClose={close}
          />
        ) : null}
        {selected && command?.kind === 'menu' && origin.current ? (
          <TemplateResourceActions
            preset={selected}
            anchor={origin.current}
            resources={props.resources}
            onClose={close}
            onRename={() => setCommand({ id: selected.id, kind: 'rename' })}
          />
        ) : null}
      </div>
    </div>
  );
}
