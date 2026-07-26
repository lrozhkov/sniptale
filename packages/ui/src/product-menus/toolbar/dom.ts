interface ProductToolbarMenuDom {
  root: HTMLDivElement;
  list: HTMLDivElement;
}

export function createProductToolbarMenuDom(props: {
  title?: string;
  compact?: boolean;
  variant?: 'default' | 'viewport' | 'capture';
}): ProductToolbarMenuDom {
  const root = document.createElement('div');
  root.className = [
    'sniptale-popover-menu',
    'sniptale-toolbar-menu',
    props.compact ? 'sniptale-toolbar-menu--compact' : '',
    props.variant === 'viewport' ? 'sniptale-viewport-menu' : '',
    props.variant === 'capture' ? 'sniptale-capture-menu' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (props.title) {
    const title = document.createElement('div');
    title.className = 'sniptale-toolbar-menu-title';
    title.textContent = props.title;
    root.appendChild(title);
  }

  const list = document.createElement('div');
  list.className = 'sniptale-toolbar-menu-list';
  root.appendChild(list);
  return { root, list };
}

export function createProductToolbarMenuItemCopyDom(label: string, hint?: string): HTMLElement {
  const copy = document.createElement('span');
  copy.className = 'sniptale-toolbar-menu-item-copy';
  const labelElement = document.createElement('span');
  labelElement.className = 'sniptale-toolbar-menu-item-label';
  labelElement.textContent = label;
  copy.appendChild(labelElement);

  if (hint) {
    const hintElement = document.createElement('span');
    hintElement.className = 'sniptale-toolbar-menu-item-hint';
    hintElement.textContent = hint;
    copy.appendChild(hintElement);
  }

  return copy;
}

export function createProductToolbarMenuItemDom(
  props: {
    dataUi?: string;
    selected?: boolean;
  } = {}
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'sniptale-popover-item',
    'sniptale-toolbar-menu-item',
    props.selected ? 'sniptale-popover-item-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (props.dataUi) button.dataset['ui'] = props.dataUi;
  return button;
}
