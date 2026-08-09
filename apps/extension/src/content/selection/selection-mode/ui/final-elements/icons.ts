import type { CaptureActionType } from '../../../../../contracts/settings';

type IconDefinition = { name: string; paths: string[] };

const CAPTURE_ACTION_ICONS: Record<CaptureActionType, IconDefinition> = {
  download_default: {
    name: 'download',
    paths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  },
  ask_preset: {
    name: 'folder-input',
    paths: [
      [
        'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9',
        'L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
      ].join(''),
      'M12 10v6',
      'm9 13 3-3 3 3',
    ],
  },
  ask_system: {
    name: 'save',
    paths: [
      'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z',
      'M17 21v-8H7v8',
      'M7 3v5h8',
    ],
  },
  copy: { name: 'copy', paths: ['M8 8h12v12H8z', 'M16 8V4H4v12h4'] },
  scenario: {
    name: 'file-stack',
    paths: [
      'M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1',
      'M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1',
      'M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z',
    ],
  },
  edit: {
    name: 'pencil',
    paths: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  },
  save_to_library: {
    name: 'save',
    paths: [
      'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z',
      'M17 21v-8H7v8',
      'M7 3v5h8',
    ],
  },
};

function createSelectionToolbarSvg(paths: string[], size: number, name: string): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size));
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.dataset['selectionIcon'] = name;
  icon.style.display = 'block';
  icon.style.flex = '0 0 auto';
  paths.forEach((pathValue) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathValue);
    icon.appendChild(path);
  });
  return icon;
}

export function createSelectionCaptureActionIcon(
  action: CaptureActionType,
  size = 16
): SVGSVGElement {
  const definition = CAPTURE_ACTION_ICONS[action];
  return createSelectionToolbarSvg(definition.paths, size, definition.name);
}

export function createSelectionCaptureMenuChevron(): SVGSVGElement {
  return createSelectionToolbarSvg(['m6 9 6 6 6-6'], 14, 'chevron-down');
}

export function createSelectionPaddingIcon(direction: 'decrease' | 'increase'): SVGSVGElement {
  const paths = direction === 'increase' ? ['M5 12h14', 'M12 5v14'] : ['M5 12h14'];
  return createSelectionToolbarSvg(paths, 18, direction === 'increase' ? 'plus' : 'minus');
}
