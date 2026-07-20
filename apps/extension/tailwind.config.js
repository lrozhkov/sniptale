import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    resolve(APP_ROOT, 'src/**/*.{js,jsx,ts,tsx}'),
    resolve(APP_ROOT, '../../packages/ui/src/**/*.{js,jsx,ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--sniptale-color-surface-canvas)',
        surface: {
          1: 'var(--sniptale-color-surface-panel)',
          canvas: 'var(--sniptale-color-surface-canvas)',
          panel: 'var(--sniptale-color-surface-panel)',
          glass: 'var(--sniptale-color-surface-panel-glass)',
          overlay: 'var(--sniptale-color-surface-overlay)',
          input: 'var(--sniptale-color-surface-input)',
          hover: 'var(--sniptale-color-surface-hover)',
        },
        border: {
          subtle: 'var(--sniptale-color-border-subtle)',
          soft: 'var(--sniptale-color-border-soft)',
          strong: 'var(--sniptale-color-border-strong)',
          accent: 'var(--sniptale-color-border-accent-strong)',
        },
        text: {
          primary: 'var(--sniptale-color-text-primary)',
          strong: 'var(--sniptale-color-text-primary-strong)',
          secondary: 'var(--sniptale-color-text-secondary)',
          muted: 'var(--sniptale-color-text-muted)',
          dim: 'var(--sniptale-color-text-dim)',
        },
        brand: {
          primary: 'var(--sniptale-color-accent)',
          secondary: 'var(--sniptale-color-danger)',
        },
        accent: {
          DEFAULT: 'var(--sniptale-color-accent)',
          emphasis: 'var(--sniptale-color-accent-emphasis)',
          soft: 'var(--sniptale-color-accent-soft)',
          glow: 'var(--sniptale-color-accent-glow)',
        },
        status: {
          success: 'var(--sniptale-color-success)',
          warning: 'var(--sniptale-color-warning)',
          danger: 'var(--sniptale-color-danger)',
          info: 'var(--sniptale-color-info)',
        },
        success: 'var(--sniptale-color-success)',
        warning: 'var(--sniptale-color-warning)',
        danger: 'var(--sniptale-color-danger)',
        info: 'var(--sniptale-color-info)',
        default: 'var(--sniptale-color-border-soft)',
        primary: 'var(--sniptale-color-text-primary)',
        secondary: 'var(--sniptale-color-text-secondary)',
        tertiary: 'var(--sniptale-color-text-dim)',
        icon: {
          purple: '#c084fc',
          teal: '#5eead4',
          blue: '#60a5fa',
        },
      },
      borderRadius: {
        sm: 'var(--sniptale-radius-sm)',
        md: 'var(--sniptale-radius-md)',
        lg: 'var(--sniptale-radius-lg)',
        xl: 'var(--sniptale-radius-xl)',
      },
      boxShadow: {
        sm: 'var(--sniptale-shadow-sm)',
        floating: 'var(--sniptale-shadow-floating)',
        'floating-strong': 'var(--sniptale-shadow-floating-strong)',
        'glow-orange':
          '0 0 15px color-mix(in srgb, var(--sniptale-color-accent-glow) 72%, transparent)',
        'glow-red': '0 0 20px color-mix(in srgb, var(--sniptale-color-danger) 35%, transparent)',
        'glow-green': '0 0 8px color-mix(in srgb, var(--sniptale-color-success) 40%, transparent)',
      },
      transitionTimingFunction: {
        spring: 'var(--sniptale-motion-spring)',
        smooth: 'var(--sniptale-motion-smooth)',
      },
      transitionDuration: {
        fast: 'var(--sniptale-duration-fast)',
        normal: 'var(--sniptale-duration-normal)',
      },
    },
  },
  plugins: [],
};
