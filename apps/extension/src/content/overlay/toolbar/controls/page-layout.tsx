import { useContext, type ReactNode } from 'react';
import { Eye, EyeOff, GripVertical, SeparatorVertical, X } from 'lucide-react';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
  type ContentToolbarDividerProps,
  type ContentToolbarGroupProps,
} from '@sniptale/ui/content-toolbar';
import type { PageToolbarControl, PageToolbarLayoutItem } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { PageToolbarControlsContext } from '../state/page-controls';
import { PageToolbarLayoutContext } from './page-layout-controller';
export { PageToolbarLayoutProvider } from './page-layout-controller';

/** Flattens only the customized page layout. Other surfaces retain the shared group. */
export function PageToolbarGroup(props: ContentToolbarGroupProps) {
  const preferences = useContext(PageToolbarControlsContext);
  return preferences?.layoutActive ? props.children : <ContentToolbarGroup {...props} />;
}

/** Default dividers give way to the saved page divider sequence during customization. */
export function PageToolbarDivider(props: ContentToolbarDividerProps) {
  const preferences = useContext(PageToolbarControlsContext);
  return preferences?.layoutActive ? null : <ContentToolbarDivider {...props} />;
}

/** A movable page button (or divider), preserving its existing command and menu owner. */
type PageToolbarSlotProps = {
  id: PageToolbarLayoutItem;
  label: string;
  control?: PageToolbarControl;
  onActivate?: () => void;
  interactiveWhileEditing?: boolean;
  children: ReactNode;
};

export function PageToolbarSlot(props: PageToolbarSlotProps) {
  const preferences = useContext(PageToolbarControlsContext);
  const layout = useContext(PageToolbarLayoutContext);
  if (!preferences?.layoutActive) return props.children;
  const visible = !props.control || preferences.controls[props.control] !== false;
  const position = (layout?.preview ?? preferences.layout).indexOf(props.id);
  return (
    <div
      data-page-toolbar-item={props.id}
      data-page-toolbar-dragging={layout?.drop?.source === props.id ? 'true' : undefined}
      data-page-toolbar-divider={props.id.startsWith('separator:') ? 'true' : undefined}
      className="sniptale-page-toolbar-slot"
      style={{ order: position < 0 ? preferences.layout.length : position }}
    >
      <div
        inert={(preferences.editing && !props.interactiveWhileEditing) || undefined}
        aria-hidden={(preferences.editing && !props.interactiveWhileEditing) || undefined}
        className={
          preferences.editing
            ? visible
              ? '[&_button:disabled]:opacity-100'
              : 'opacity-40 [&_button:disabled]:opacity-100'
            : undefined
        }
      >
        {props.children}
      </div>
      {preferences.editing ? <PageToolbarCustomizationControl {...props} /> : null}
    </div>
  );
}

/** Routes customization input without changing the command owned by the child control. */
function PageToolbarCustomizationControl(props: PageToolbarSlotProps) {
  const preferences = useContext(PageToolbarControlsContext)!;
  const layout = useContext(PageToolbarLayoutContext);
  const visible = !props.control || preferences.controls[props.control] !== false;
  const overridden = props.control ? preferences.isOverridden(props.control) : false;
  const hint = translate('content.toolbar.pageReorderHint');
  const label = `${props.label}. ${hint}${
    props.control ? ` ${translate('content.toolbar.pageReorderVisibilityHint')}` : ''
  }`;
  const title = `${props.label}\n${hint}${
    overridden ? `\n${translate('content.toolbar.pageControlOverride')}` : ''
  }`;
  return (
    <ContentToolbarButton
      type="button"
      tone="property"
      dataUi={
        props.control
          ? `content.toolbar.visibility.${props.control}`
          : `content.toolbar.layout.${props.id}`
      }
      aria-label={label}
      title={title}
      aria-pressed={props.control ? visible : undefined}
      aria-disabled={preferences.pending}
      className={[
        'sniptale-page-toolbar-customization-button',
        props.interactiveWhileEditing
          ? 'sniptale-page-toolbar-move-handle !absolute !h-3 !min-h-3 !w-3 !min-w-3 !p-0 touch-none'
          : '!absolute inset-0 !h-full !w-full touch-none',
      ].join(' ')}
      style={{ background: 'transparent' }}
      onPointerDown={(event) => layout?.begin(props.id, event)}
      onPointerMove={(event) => layout?.move(event)}
      onPointerUp={(event) => layout?.finish(event)}
      onPointerCancel={() => layout?.cancel()}
      onLostPointerCapture={() => layout?.cancel()}
      onKeyDown={(event) => {
        layout?.consumeClick(props.id);
        if (
          !event.altKey ||
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        const index = layout?.items.indexOf(props.id) ?? -1;
        const target = index >= 0 ? layout?.items[index + direction] : undefined;
        if (target && !preferences.pending)
          void preferences.moveItem(props.id, target, direction < 0);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (layout?.consumeClick(props.id) || preferences.pending) return;
        if (props.control) void preferences.setVisible(props.control, !visible);
        else props.onActivate?.();
      }}
    >
      <PageToolbarSlotIndicator {...props} visible={visible} overridden={overridden} />
    </ContentToolbarButton>
  );
}

/** Keeps drag, visibility, and mode-override marks inside the existing button geometry. */
function PageToolbarSlotIndicator(
  props: PageToolbarSlotProps & {
    visible: boolean;
    overridden: boolean;
  }
) {
  const Indicator = props.id.startsWith('separator:') ? X : props.visible ? Eye : EyeOff;
  return (
    <span
      className="absolute left-px top-px inline-flex shrink-0"
      style={{
        width: props.interactiveWhileEditing
          ? 10
          : 'calc(var(--sniptale-toolbar-button-size) - 2px)',
        height: props.interactiveWhileEditing
          ? 10
          : 'calc(var(--sniptale-toolbar-button-size) - 2px)',
      }}
    >
      <GripVertical
        size={10}
        className="absolute left-0 top-0 text-[var(--sniptale-color-text-secondary)]"
        style={{ width: 10, height: 10 }}
      />
      {props.control || props.onActivate ? (
        <Indicator
          size={10}
          className="absolute bottom-0 right-0 text-[var(--sniptale-color-text-secondary)]"
          style={{ width: 10, height: 10 }}
        />
      ) : null}
      {props.overridden ? (
        <span
          aria-hidden="true"
          data-ui="content.toolbar.visibility-override"
          className="absolute left-0 bottom-0 h-1 w-1 rounded-full bg-[var(--sniptale-color-text-secondary)]"
        />
      ) : null}
    </span>
  );
}

/** Renders saved dividers as independent flex items without moving React-owned controls. */
export function PageToolbarLayoutDecorations() {
  const preferences = useContext(PageToolbarControlsContext);
  const layout = useContext(PageToolbarLayoutContext);
  if (!preferences?.layoutActive) return null;
  const separators: PageToolbarLayoutItem[] = [];
  let pending: PageToolbarLayoutItem | null = null;
  let hasButton = false;
  for (const item of layout?.items ?? []) {
    if (item.startsWith('separator:')) {
      if (preferences.editing) separators.push(item);
      else if (hasButton) pending = item;
    } else {
      if (pending) separators.push(pending);
      pending = null;
      hasButton = true;
    }
  }
  return (
    <>
      {separators.map((id) => (
        <PageToolbarSlot
          key={id}
          id={id}
          label={translate('content.toolbar.pageRemoveDivider')}
          onActivate={() => void preferences.removeSeparator(id)}
        >
          <ContentToolbarDivider />
        </PageToolbarSlot>
      ))}
      {preferences.editing ? (
        <ContentToolbarButton
          type="button"
          tone="utility"
          dataUi="content.toolbar.customize-add-divider"
          title={translate('content.toolbar.pageAddDivider')}
          disabled={!preferences.canAddSeparator}
          aria-disabled={preferences.pending}
          style={{ order: 2147483645 }}
          onClick={() => {
            if (!preferences.pending) void preferences.addSeparator();
          }}
        >
          <SeparatorVertical size={18} />
        </ContentToolbarButton>
      ) : null}
    </>
  );
}
