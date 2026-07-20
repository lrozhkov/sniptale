export const CAPTURE_CANVAS_HEIGHT = 900;
export const CAPTURE_CANVAS_WIDTH = 1440;

export const TARGET_MIN_SIZE = 30;

export const CAPTURE_STYLE_PRESETS = {
  callout: {
    backgroundColor: '#fffaf2',
    borderColor: '#d9a35f',
    borderWidth: 1.5,
    textColor: '#2f2a24',
  },
  click: {
    fillColor: 'rgba(47, 110, 234, 0.2)',
    strokeColor: '#2f6eea',
  },
  connector: {
    strokeColor: '#c8652b',
    strokeWidth: 3,
  },
  highlight: {
    fillColor: 'rgba(249, 115, 22, 0.1)',
    strokeColor: '#f97316',
  },
} as const;
