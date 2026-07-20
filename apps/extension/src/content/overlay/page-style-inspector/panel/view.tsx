import { GripHorizontal, Image, Square, Type, X } from 'lucide-react';
import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  PAGE_STYLE_INSPECTOR_TABS,
  type PageStyleInspectorTab,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import { isPageStyleRulesUiEnabled } from '../../../../platform/config/page-style-rules-access';
import { ActiveTab } from './tabs';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

const PANEL_WIDTH = 372;
const TAB_ORDER: PageStyleInspectorTab[] = [
  PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
  PAGE_STYLE_INSPECTOR_TABS.TEMPLATES,
  PAGE_STYLE_INSPECTOR_TABS.RULES,
];

function getVisibleTabOrder(): PageStyleInspectorTab[] {
  return isPageStyleRulesUiEnabled()
    ? TAB_ORDER
    : TAB_ORDER.filter((tab) => tab !== PAGE_STYLE_INSPECTOR_TABS.RULES);
}

function tabLabel(tab: PageStyleInspectorTab): string {
  switch (tab) {
    case PAGE_STYLE_INSPECTOR_TABS.TEMPLATES:
      return translate('content.pageStyleInspector.tabTemplates');
    case PAGE_STYLE_INSPECTOR_TABS.RULES:
      return translate('content.pageStyleInspector.tabRules');
    case PAGE_STYLE_INSPECTOR_TABS.PROPERTIES:
    default:
      return translate('content.pageStyleInspector.tabProperties');
  }
}

function selectionLabel(state: PageStyleInspectorViewState): string {
  if (!state.selection) {
    return translate('content.pageStyleInspector.emptySelectionTitle');
  }

  return state.selection.selectorLabel;
}

function selectionKindLabel(state: PageStyleInspectorViewState): string {
  if (!state.selection) {
    return translate('content.pageStyleInspector.emptySelectionTitle');
  }

  switch (state.selection.kind) {
    case 'image':
      return translate('content.pageStyleInspector.selectedImage');
    case 'text':
      return translate('content.pageStyleInspector.selectedText');
    case 'block':
      return translate('content.pageStyleInspector.selectedBlock');
  }
}

function SelectionKindIcon(props: { state: PageStyleInspectorViewState }) {
  const className = 'shrink-0 text-[var(--sniptale-color-text-secondary)]';
  if (!props.state.selection) {
    return <Square size={14} className={className} />;
  }

  switch (props.state.selection.kind) {
    case 'image':
      return <Image size={14} className={className} />;
    case 'text':
      return <Type size={14} className={className} />;
    case 'block':
      return <Square size={14} className={className} />;
  }
}

function usePanelPosition() {
  const [position, setPosition] = useState({ x: window.innerWidth - PANEL_WIDTH - 12, y: 96 });

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const origin = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.x,
      y: position.y,
    };

    function handlePointerMove(moveEvent: PointerEvent) {
      const panelWidth = Math.min(PANEL_WIDTH, Math.max(0, window.innerWidth - 24));
      const maxX = Math.max(12, window.innerWidth - panelWidth - 12);
      setPosition({
        x: Math.max(12, Math.min(maxX, origin.x + moveEvent.clientX - origin.pointerX)),
        y: Math.max(
          12,
          Math.min(window.innerHeight - 160, origin.y + moveEvent.clientY - origin.pointerY)
        ),
      });
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  return { handlePointerDown, position };
}

function TabList(props: {
  activeTab: PageStyleInspectorTab;
  onChange: (tab: PageStyleInspectorTab) => void;
}) {
  const tabs = getVisibleTabOrder();

  return (
    <div
      className="grid gap-1 rounded-[10px] bg-[color:var(--sniptale-color-surface-input)] p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          className={[
            'h-8 rounded-[8px] px-2 text-xs font-semibold transition',
            'data-[active=true]:bg-[var(--sniptale-color-surface-panel)]',
            'data-[active=true]:text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
          data-active={props.activeTab === tab}
          onClick={() => props.onChange(tab)}
        >
          {tabLabel(tab)}
        </button>
      ))}
    </div>
  );
}

function InspectorHeader(props: {
  actions: PageStyleInspectorActions;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  state: PageStyleInspectorViewState;
}) {
  return (
    <header
      className="cursor-grab border-b border-[color:var(--sniptale-color-border-soft)] px-3 py-2"
      onPointerDown={props.onPointerDown}
    >
      <InspectorHeaderTitle actions={props.actions} state={props.state} />
      <InspectorSelectionSummary state={props.state} />
    </header>
  );
}

function InspectorHeaderTitle(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  return (
    <div className="flex items-center gap-2">
      <GripHorizontal size={16} className="shrink-0 text-[var(--sniptale-color-text-dim)]" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="truncate text-xs font-bold">
          {translate('content.pageStyleInspector.title')}
        </div>
        <SelectionKindBadge state={props.state} />
      </div>
      <InspectorCloseButton actions={props.actions} />
    </div>
  );
}

function SelectionKindBadge(props: { state: PageStyleInspectorViewState }) {
  return (
    <span
      className={[
        'inline-flex min-w-0 max-w-[8rem] items-center gap-1 rounded-[7px]',
        'bg-[var(--sniptale-color-surface-input)] px-1.5 py-1 text-[10px] font-bold',
        'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      <SelectionKindIcon state={props.state} />
      <span className="truncate">{selectionKindLabel(props.state)}</span>
    </span>
  );
}

function InspectorCloseButton(props: { actions: PageStyleInspectorActions }) {
  return (
    <button
      type="button"
      className={[
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]',
        'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      title={translate('content.pageStyleInspector.close')}
      aria-label={translate('content.pageStyleInspector.close')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={props.actions.close}
    >
      <X size={16} />
    </button>
  );
}

function InspectorSelectionSummary(props: { state: PageStyleInspectorViewState }) {
  const domPath =
    props.state.selection?.domPath ?? translate('content.pageStyleInspector.noDomPath');

  return (
    <div className="mt-1.5 min-w-0 pl-6">
      <div
        className="truncate font-mono text-[11px] font-semibold text-[var(--sniptale-color-text-primary)]"
        title={selectionLabel(props.state)}
      >
        {selectionLabel(props.state)}
      </div>
      <div className="truncate text-[10px] text-[var(--sniptale-color-text-dim)]" title={domPath}>
        {domPath}
      </div>
    </div>
  );
}

export function PageStyleInspectorPanel(props: {
  actions: PageStyleInspectorActions;
  open: boolean;
  state: PageStyleInspectorViewState;
}) {
  const { handlePointerDown, position } = usePanelPosition();

  if (!props.open) {
    return null;
  }

  return (
    <aside
      data-ui="content.page-style-inspector.panel"
      className={[
        'fixed z-[2147483646] grid max-h-[min(80vh,calc(100vh-24px))]',
        'w-[min(23.25rem,calc(100vw-24px))]',
        'grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr] overflow-hidden overscroll-contain rounded-[12px] border',
        'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
        'pointer-events-auto text-[var(--sniptale-color-text-primary)] shadow-xl',
      ].join(' ')}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <InspectorHeader
        actions={props.actions}
        onPointerDown={handlePointerDown}
        state={props.state}
      />
      <div className="min-w-0 p-3">
        <TabList activeTab={props.state.activeTab} onChange={props.actions.setActiveTab} />
      </div>
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 pb-3">
        <ActiveTab actions={props.actions} state={props.state} />
      </div>
    </aside>
  );
}
