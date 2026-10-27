import { createElement as createLucideElement } from 'lucide';
import { getQuickActionIconNode } from '../../../features/quick-actions-presets/icons';
import { isTrustedDomEvent } from '../../platform/trusted-events';
import { PAGE_CORNERS, type PageCorner } from '../../../contracts/page-launch';
import { pageLauncherMessages } from '../../../platform/i18n/messages/content/page-launcher';
import {
  installCornerGroupDrag,
  type CornerGroupDragState,
} from '../../platform/corner-group/drag';
import { pageCornerOffsets } from '../../platform/corner-group/geometry';
import { getShimQuickActionName, type ShimPagePresentation } from './preferences';
import type { ShimQuickAction } from './quick-actions';
import { launcherStyles } from './launcher.styles';

export interface ShimLauncherOptions {
  presentation: ShimPagePresentation;
  failed?: boolean;
  busy?: boolean;
  actions: ShimQuickAction[];
  open(event: Event): Promise<void>;
  trigger(action: ShimQuickAction, event: Event): Promise<void>;
  saveCorner(corner: PageCorner, event: Event): Promise<void>;
}
function menuProjection(options: ShimLauncherOptions): string {
  const locale = options.presentation.locale;
  return JSON.stringify([
    locale,
    options.actions
      .filter((action) => action.status)
      .map((action) => [action.id, getShimQuickActionName(action, locale), action.icon]),
  ]);
}

function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function createLauncherElements() {
  const host = document.createElement('div');
  host.id = 'sniptale-page-launcher';
  host.className = 'sniptale-app';
  host.setAttribute('data-floating-ui-capture-transient', 'true');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = launcherStyles;
  const group = document.createElement('div');
  group.className = 'group';
  group.setAttribute('role', 'toolbar');
  const open = button('main', ['M4 4h16v16H4z', 'M4 9h16']);
  const actions = button('main actions', ['m13 2-9 12h7l-1 8 10-12h-7z']);
  const grip = button('grip', [
    'M10 5a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z',
    'M10 12a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z',
    'M10 19a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z',
    'M16 5a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z',
    'M16 12a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z',
    'M16 19a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z',
  ]);
  group.append(grip, open, actions);
  shadow.append(style, group);
  document.documentElement.append(host);
  const guide = document.createElement('div');
  guide.className = 'guide';
  guide.setAttribute('aria-hidden', 'true');
  for (const corner of PAGE_CORNERS) {
    const zone = document.createElement('div');
    zone.className = 'guide-zone';
    zone.dataset['corner'] = corner;
    zone.style.setProperty(
      corner.endsWith('left') ? 'left' : 'right',
      corner.endsWith('left') ? '8px' : '20px'
    );
    zone.style.setProperty(corner.startsWith('top') ? 'top' : 'bottom', '8px');
    guide.append(zone);
  }
  return { host, shadow, group, open, actions, grip, guide };
}
function button(className: string, paths: string[]) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.append(icon(paths));
  return element;
}

class ShimLauncherView {
  private options: ShimLauncherOptions;
  private disposed = false;
  private pending = false;
  private near = false;
  private menu: HTMLDivElement | null = null;
  private error: HTMLDivElement | null = null;
  private dragState: CornerGroupDragState = { draft: null, pending: false, dragging: false };
  private readonly elements = createLauncherElements();
  private readonly drag: ReturnType<typeof installCornerGroupDrag>;
  constructor(initial: ShimLauncherOptions) {
    this.options = initial;
    const { open, actions, shadow, group, grip } = this.elements;
    open.addEventListener('click', (event) => {
      void this.run(event, () => this.options.open(event));
    });
    actions.addEventListener('click', this.toggleMenu);
    window.addEventListener('pointermove', this.pointer, { passive: true });
    window.addEventListener('pointerdown', this.outside, true);
    shadow.addEventListener('keydown', this.key);
    shadow.addEventListener('focusin', this.render);
    shadow.addEventListener('focusout', this.render);
    this.drag = installCornerGroupDrag({
      group,
      handle: grip,
      getCorner: () => this.options.presentation.preferences.corner,
      onCommit: async (corner, event) => {
        if (!isTrustedDomEvent(event)) throw new Error('Trusted gesture required');
        await this.options.saveCorner(corner, event);
      },
      onState: (state) => {
        this.dragState = state;
        this.render();
      },
      onError: () => this.showError(),
    });
    if (initial.failed) this.showError();
    this.render();
  }
  private showError() {
    this.error?.remove();
    this.error = document.createElement('div');
    this.error.className = 'error';
    this.error.setAttribute('role', 'alert');
    this.error.textContent = this.label('failed');
    this.elements.shadow.append(this.error);
    this.render();
  }
  private label(key: keyof typeof pageLauncherMessages) {
    return pageLauncherMessages[key][this.options.presentation.locale];
  }
  private closeMenu(restoreFocus = false) {
    this.menu?.remove();
    this.menu = null;
    this.elements.actions.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.elements.actions.focus();
    this.render();
  }
  private position(element: HTMLElement, corner: PageCorner, offset: number) {
    element.style.left = corner.endsWith('left') ? '20px' : '';
    element.style.right = corner.endsWith('right') ? '20px' : '';
    element.style.top = corner.startsWith('top') ? `${offset}px` : '';
    element.style.bottom = corner.startsWith('bottom') ? `${offset}px` : '';
  }
  private render = () => {
    if (this.disposed) return;
    const { preferences, theme } = this.options.presentation;
    const corner = this.dragState.draft?.corner ?? preferences.corner;
    const resolvedTheme =
      theme === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    this.elements.host.setAttribute('data-theme', resolvedTheme);
    this.elements.group.dataset['hoverOnly'] = String(preferences.hoverOnly);
    this.elements.group.dataset['left'] = String(corner.endsWith('left'));
    this.elements.group.dataset['dragging'] = String(this.dragState.dragging);
    this.elements.group.style.cssText = '';
    if (this.dragState.draft)
      Object.assign(this.elements.group.style, {
        left: `${this.dragState.draft.x}px`,
        top: `${this.dragState.draft.y}px`,
      });
    else
      for (const [key, value] of Object.entries(pageCornerOffsets(corner)))
        this.elements.group.style.setProperty(
          key,
          typeof value === 'number' ? `${value}px` : value
        );
    const focused = this.elements.shadow.activeElement !== null;
    this.elements.group.dataset['hidden'] = String(
      this.pending ||
        this.options.busy ||
        (preferences.hoverOnly && !this.near && !focused && !this.menu && !this.dragState.dragging)
    );
    this.elements.open.setAttribute('aria-label', this.label('open'));
    this.elements.open.title = this.label('open');
    this.elements.grip.setAttribute('aria-label', this.label('move'));
    this.elements.grip.title = this.label('move');
    this.elements.actions.setAttribute('aria-label', this.label('actions'));
    this.elements.actions.title = this.label('actions');
    this.elements.actions.setAttribute('aria-haspopup', 'menu');
    this.elements.actions.dataset['menuSide'] = corner.startsWith('bottom') ? 'up' : 'down';
    this.elements.actions.hidden = !preferences.quickActionsCorner;
    this.elements.open.disabled = this.pending;
    this.elements.actions.disabled = this.pending;
    if (this.menu) this.position(this.menu, corner, 68);
    if (this.error) this.position(this.error, corner, 68);
    if (this.dragState.dragging) {
      for (const zone of this.elements.guide.children) {
        if (zone instanceof HTMLElement)
          zone.dataset['active'] = String(zone.dataset['corner'] === corner);
      }
      if (!this.elements.guide.isConnected) this.elements.shadow.append(this.elements.guide);
    } else this.elements.guide.remove();
  };
  private async run(event: Event, command: () => Promise<void>) {
    if (!isTrustedDomEvent(event) || this.pending || this.disposed) return;
    this.pending = true;
    this.error?.remove();
    this.error = null;
    this.closeMenu();
    this.render();
    try {
      await command();
    } catch {
      if (!this.disposed) {
        this.error = document.createElement('div');
        this.error.className = 'error';
        this.error.setAttribute('role', 'alert');
        this.error.textContent = this.label('failed');
        this.elements.shadow.append(this.error);
      }
    } finally {
      this.pending = false;
      this.render();
    }
  }
  private refreshMenu() {
    if (!this.menu) return;
    const previousItems = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button'));
    const focusedIndex = previousItems.findIndex(
      (item) => item === this.elements.shadow.activeElement
    );
    const focusedId = previousItems[focusedIndex]?.dataset['actionId'];
    this.menu.replaceChildren();
    const enabled = this.options.actions.filter((action) => action.status);
    if (!enabled.length) this.menu.textContent = this.label('empty');
    for (const [index, action] of enabled.entries()) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.dataset['actionId'] = action.id;
      const glyph = createLucideElement(getQuickActionIconNode(action.icon), {
        'aria-hidden': 'true',
      });
      const label = document.createElement('span');
      label.textContent = getShimQuickActionName(action, this.options.presentation.locale);
      item.append(glyph, label);
      if (index < 10) {
        const digit = String(index === 9 ? 0 : index + 1);
        const shortcut = document.createElement('kbd');
        shortcut.textContent = digit;
        item.setAttribute('aria-keyshortcuts', digit);
        item.append(shortcut);
      }
      item.addEventListener('click', (click) => {
        void this.run(click, () => this.options.trigger(action, click));
      });
      this.menu.append(item);
    }
    if (focusedIndex >= 0) {
      const items = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button'));
      const focus =
        items.find((item) => item.dataset['actionId'] === focusedId) ??
        items[Math.min(focusedIndex, items.length - 1)] ??
        this.elements.actions;
      focus.focus();
    }
  }
  private toggleMenu = (event: MouseEvent) => {
    if (!isTrustedDomEvent(event) || this.pending) return;
    if (this.menu) {
      this.closeMenu();
      return;
    }
    this.menu = document.createElement('div');
    this.menu.className = 'menu';
    this.menu.setAttribute('role', 'menu');
    this.refreshMenu();
    this.elements.shadow.append(this.menu);
    this.elements.actions.setAttribute('aria-expanded', 'true');
    this.render();
    this.menu.querySelector('button')?.focus();
  };
  private pointer = (event: PointerEvent) => {
    const corner = this.options.presentation.preferences.corner;
    this.near =
      (corner.endsWith('left') ? event.clientX < 120 : event.clientX > innerWidth - 120) &&
      (corner.startsWith('top') ? event.clientY < 120 : event.clientY > innerHeight - 120);
    this.render();
  };
  private outside = (event: PointerEvent) => {
    if (!event.composedPath().includes(this.elements.host)) this.closeMenu();
  };
  private key = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (this.menu && /^[0-9]$/.test(event.key)) {
      const action = this.options.actions.filter((entry) => entry.status)[
        event.key === '0' ? 9 : Number(event.key) - 1
      ];
      const trigger = this.elements.actions;
      if (
        !action ||
        !isTrustedDomEvent(event) ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        this.pending ||
        this.options.busy ||
        this.disposed ||
        this.dragState.dragging ||
        this.dragState.pending ||
        trigger.matches(':disabled') ||
        trigger.getClientRects().length === 0 ||
        getComputedStyle(trigger).visibility === 'hidden' ||
        this.elements.host.closest('[inert]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      trigger.focus({ preventScroll: true });
      void this.run(event, () => this.options.trigger(action, event));
      return;
    }
    if (event.key === 'Escape' && this.menu) {
      event.preventDefault();
      this.closeMenu(true);
    }
    if (!this.menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(this.menu.querySelectorAll('button'));
    const index = items.findIndex((item) => item === this.elements.shadow.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  update = (next: ShimLauncherOptions) => {
    const menuChanged = this.menu && menuProjection(this.options) !== menuProjection(next);
    this.options = next;
    if (next.busy || !next.presentation.preferences.quickActionsCorner) this.closeMenu();
    else if (menuChanged) this.refreshMenu();
    this.drag.refresh();
    this.render();
  };
  dispose = () => {
    this.disposed = true;
    this.drag.dispose();
    window.removeEventListener('pointermove', this.pointer);
    window.removeEventListener('pointerdown', this.outside, true);
    this.elements.shadow.removeEventListener('keydown', this.key);
    this.elements.host.remove();
  };
}
/** Disposable native DOM view; commands and accepted preferences belong to its caller. */
export function createShimLauncher(initial: ShimLauncherOptions) {
  const view = new ShimLauncherView(initial);
  return { update: view.update, dispose: view.dispose };
}
