import { VideoAnnotationRenderNodeKind } from '../types';
import { group, rectNode, textNode } from './helpers';
import { glassPanel, mutedText, pill, titleText } from './apple-glass-style';

export function introTree() {
  return group([
    rectNode('panel', { height: '100%', width: '100%', x: 0, y: 0 }, glassPanel(34)),
    rectNode('accent', { height: 5, width: '28%', x: '36%', y: '27%' }, pill()),
    textNode(
      'headline',
      'field:headline',
      { height: '28%', width: '76%', x: '12%', y: '31%' },
      titleText(38, 'center')
    ),
    textNode(
      'subline',
      'field:subline',
      { height: '14%', width: '58%', x: '21%', y: '58%' },
      mutedText(15, 'center')
    ),
  ]);
}

export function lowerThirdTree() {
  return group([
    rectNode('panel', { height: '100%', width: '100%', x: 0, y: 0 }, glassPanel(999)),
    rectNode('accent', { height: '72%', width: 4, x: 22, y: '14%' }, pill()),
    textNode(
      'headline',
      'field:headline',
      { height: 32, width: '62%', x: 42, y: 17 },
      titleText(21)
    ),
    textNode('subline', 'field:subline', { height: 22, width: '54%', x: 42, y: 49 }, mutedText(13)),
  ]);
}

export function titleTree() {
  return group([
    rectNode('panel', { height: '74%', width: '82%', x: '9%', y: '13%' }, glassPanel(30)),
    textNode(
      'headline',
      'field:headline',
      { height: '30%', width: '70%', x: '15%', y: '28%' },
      titleText(34, 'center')
    ),
    textNode(
      'subline',
      'field:subline',
      { height: '15%', width: '64%', x: '18%', y: '59%' },
      mutedText(14, 'center')
    ),
  ]);
}

export function pinCalloutTree() {
  return group([
    {
      frame: { height: 26, width: 26 },
      id: 'pin',
      nodeType: VideoAnnotationRenderNodeKind.MARKER,
      props: { target: 'point', variant: 'ring' },
      style: { stroke: 'token:accent', strokeWidth: 3 },
    },
    rectNode('panel', { height: '76%', width: '58%', x: '34%', y: '12%' }, glassPanel(24), [
      textNode(
        'headline',
        'field:headline',
        { height: 28, width: '78%', x: 24, y: 18 },
        titleText(18)
      ),
      textNode(
        'subline',
        'field:subline',
        { height: 42, width: '78%', x: 24, y: 48 },
        mutedText(13)
      ),
    ]),
  ]);
}

export function arrowCardTree() {
  return group([
    {
      frame: { height: 16, width: 16 },
      id: 'dot',
      nodeType: VideoAnnotationRenderNodeKind.MARKER,
      props: { target: 'point' },
      style: { fill: 'token:accent' },
    },
    {
      frame: { height: 72, width: '36%', x: '10%', y: '42%' },
      id: 'leader',
      nodeType: VideoAnnotationRenderNodeKind.PATH,
      props: { arrowEnd: true, path: 'elbow', progress: 0 },
      style: { stroke: 'token:accent', strokeWidth: 2 },
    },
    rectNode(
      'panel',
      { height: '72%', width: '46%', x: '49%', y: '14%' },
      glassPanel(24),
      [
        textNode(
          'headline',
          'field:headline',
          { height: 30, width: '78%', x: 24, y: 18 },
          titleText(18)
        ),
        textNode(
          'subline',
          'field:subline',
          { height: 44, width: '78%', x: 24, y: 50 },
          mutedText(13)
        ),
      ],
      { maskDirection: 'right', maskProgress: 0 }
    ),
  ]);
}

export function spotlightTree() {
  return group([
    {
      id: 'target-glow',
      nodeType: VideoAnnotationRenderNodeKind.SPOTLIGHT,
      props: { target: 'rect' },
      style: { fill: 'rgba(47,124,246,0.16)', stroke: 'rgba(255,255,255,0.68)', strokeWidth: 1 },
    },
    {
      id: 'target-frame',
      nodeType: VideoAnnotationRenderNodeKind.FRAME,
      props: { target: 'rect' },
      style: { radius: 22, stroke: 'token:accent', strokeWidth: 2 },
    },
    rectNode('panel', { height: 86, width: '42%', x: '54%', y: '10%' }, glassPanel(24), [
      textNode(
        'headline',
        'field:headline',
        { height: 28, width: '78%', x: 22, y: 16 },
        titleText(18)
      ),
      textNode(
        'subline',
        'field:subline',
        { height: 32, width: '78%', x: 22, y: 44 },
        mutedText(12)
      ),
    ]),
  ]);
}

export function magnifierTree() {
  return group([
    {
      id: 'target-frame',
      nodeType: VideoAnnotationRenderNodeKind.FRAME,
      props: { target: 'rect' },
      style: { radius: 18, stroke: 'token:glassStroke', strokeWidth: 2 },
    },
    rectNode('panel', { height: '72%', width: '38%', x: '57%', y: '14%' }, glassPanel(28), [
      textNode(
        'headline',
        'field:headline',
        { height: 32, width: '78%', x: 24, y: 22 },
        titleText(20)
      ),
      textNode(
        'subline',
        'field:subline',
        { height: 44, width: '78%', x: 24, y: 58 },
        mutedText(13)
      ),
    ]),
  ]);
}

export function progressSceneTree() {
  return group([
    rectNode('panel', { height: '100%', width: '100%', x: 0, y: 0 }, glassPanel(32)),
    textNode(
      'headline',
      'field:headline',
      { height: '22%', width: '70%', x: '15%', y: '23%' },
      titleText(30, 'center')
    ),
    textNode(
      'subline',
      'field:subline',
      { height: '14%', width: '54%', x: '23%', y: '45%' },
      mutedText(14, 'center')
    ),
    {
      frame: { height: 5, width: '50%', x: '25%', y: '68%' },
      id: 'progress',
      nodeType: VideoAnnotationRenderNodeKind.PROGRESS,
      props: { progress: 0 },
      style: { backgroundFill: 'rgba(255,255,255,0.18)', fill: 'token:accent' },
    },
  ]);
}
