import type { CSSProperties } from 'react';
import { resolveGuideTextStyle } from '../../features/scenario/project/public';
import type { GuideStyle, GuideBlock } from '@sniptale/runtime-contracts/scenario/types/guide';

const palettes = {
  paper: {
    surface: '#ffffff',
    text: '#202124',
    muted: '#606773',
    border: '#dfe2e7',
    accent: '#b94719',
  },
  warm: {
    surface: '#fffaf0',
    text: '#30291f',
    muted: '#706454',
    border: '#e3d8c5',
    accent: '#98541b',
  },
  graphite: {
    surface: '#24262b',
    text: '#f3f4f6',
    muted: '#b8bec9',
    border: '#535966',
    accent: '#ffad70',
  },
};

type GuideDocumentStyle = CSSProperties & Record<`--guide-${string}`, string>;

/** Projects canonical appearance into local document variables, independent of app chrome. */
export function guideDocumentStyle(style: GuideStyle): GuideDocumentStyle {
  const palette = palettes[style.theme];
  return {
    '--guide-paper': palette.surface,
    '--guide-ink': palette.text,
    '--guide-muted': palette.muted,
    '--guide-border': palette.border,
    '--guide-accent': style.accentColor ?? palette.accent,
    '--guide-font':
      style.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'var(--sniptale-font-sans)',
    '--guide-padding': { compact: '1.25rem', comfortable: '2rem', spacious: '3rem' }[style.density],
    '--guide-gap': { compact: '0.75rem', comfortable: '1.25rem', spacious: '2rem' }[style.density],
    '--guide-width': { narrow: '640px', standard: '900px', wide: '1200px' }[style.contentWidth],
    '--guide-image-border': { none: '0px', subtle: '1px', strong: '3px' }[style.imageBorder],
    '--guide-number-background': style.numberStyle === 'plain' ? 'transparent' : palette.border,
  };
}

/** Preserve the heading/body base size while applying bounded prose settings. */
export function guideTextAppearance(
  block: Extract<GuideBlock, { kind: 'heading' | 'text' | 'note' }>
): CSSProperties {
  const style = resolveGuideTextStyle(block.textStyle);
  return {
    fontSize: `${(block.kind === 'heading' ? 1.125 : 1) * style.scale}rem`,
    textAlign: style.alignment,
  };
}
