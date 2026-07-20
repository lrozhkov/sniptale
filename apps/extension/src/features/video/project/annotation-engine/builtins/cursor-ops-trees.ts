import { VideoAnnotationRenderNodeKind } from '../types';
import { group, rectNode, textNode } from './helpers';
import { codeText, metaText, opsPanel, statusFill } from './cursor-ops-style';

export function bootTree() {
  return group([
    rectNode('panel', { height: '100%', width: '100%', x: 0, y: 0 }, opsPanel(10)),
    textNode(
      'badge',
      'field:badge',
      { height: 26, width: '24%', x: 26, y: 22 },
      { ...metaText(12), backgroundFill: 'rgba(23,20,18,0.08)', paddingX: 8, radius: 999 }
    ),
    textNode(
      'headline',
      'field:headline',
      { height: 42, width: '76%', x: 26, y: '38%' },
      codeText(24)
    ),
    textNode(
      'subline',
      'field:subline',
      { height: 28, width: '70%', x: 26, y: '60%' },
      metaText(14)
    ),
    rectNode(
      'accent',
      { height: 4, width: '42%', x: 26, y: '75%' },
      { fill: 'token:accent', radius: 2 }
    ),
  ]);
}

export function lowerThirdTree() {
  return group([
    rectNode('panel', { height: '100%', width: '100%', x: 0, y: 0 }, opsPanel(8)),
    rectNode(
      'accent',
      { height: '100%', width: 5, x: 0, y: 0 },
      { fill: 'token:accent', radius: 0 }
    ),
    textNode(
      'headline',
      'field:headline',
      { height: 26, width: '48%', x: 20, y: 14 },
      codeText(16)
    ),
    textNode(
      'subline',
      'field:subline',
      { height: 22, width: '39%', x: '56%', y: 15 },
      metaText(12, 'right')
    ),
  ]);
}

export function codeTitleTree() {
  return group([
    rectNode('panel', { height: '76%', width: '80%', x: '10%', y: '12%' }, opsPanel(8)),
    textNode(
      'badge',
      'шаг',
      { height: 24, width: 64, x: '14%', y: '19%' },
      { ...metaText(11), backgroundFill: 'rgba(23,20,18,0.08)', paddingX: 8, radius: 999 }
    ),
    textNode(
      'headline',
      'field:headline',
      { height: 38, width: '66%', x: '14%', y: '39%' },
      codeText(26)
    ),
    textNode(
      'subline',
      'field:subline',
      { height: 24, width: '66%', x: '14%', y: '60%' },
      metaText(13)
    ),
    rectNode(
      'caret',
      { height: 34, width: 3, x: '82%', y: '39%' },
      { fill: 'token:accent', radius: 0 }
    ),
  ]);
}

export function diagnosticTree() {
  return group([
    {
      id: 'target-frame',
      nodeType: VideoAnnotationRenderNodeKind.FRAME,
      props: { target: 'rect', variant: 'bracket' },
      style: { stroke: 'token:accent', strokeWidth: 2 },
    },
    rectNode('panel', { height: '76%', width: '46%', x: '51%', y: '12%' }, opsPanel(8), [
      rectNode(
        'stack-a',
        { height: 24, width: '74%', x: 18, y: 18 },
        statusFill('rgba(249,115,22,0.16)')
      ),
      rectNode(
        'stack-b',
        { height: 24, width: '82%', x: 18, y: 48 },
        statusFill('rgba(16,185,129,0.16)')
      ),
      textNode(
        'headline',
        'field:headline',
        { height: 32, width: '78%', x: 20, y: 84 },
        codeText(16)
      ),
      textNode(
        'subline',
        'field:subline',
        { height: 38, width: '78%', x: 20, y: 114 },
        metaText(12)
      ),
    ]),
  ]);
}

export function symbolPointerTree() {
  return group([
    {
      frame: { height: 18, width: 18 },
      id: 'dot',
      nodeType: VideoAnnotationRenderNodeKind.MARKER,
      props: { target: 'point', variant: 'ring' },
      style: { stroke: 'token:accent', strokeWidth: 2 },
    },
    {
      frame: { height: 1, width: '22%', x: '8%', y: '50%' },
      id: 'leader',
      nodeType: VideoAnnotationRenderNodeKind.LINE,
      props: { arrowEnd: true, progress: 1 },
      style: { stroke: 'token:accent', strokeWidth: 2 },
    },
    rectNode('panel', { height: 64, width: '46%', x: '32%', y: '27%' }, opsPanel(6), [
      textNode(
        'headline',
        'field:headline',
        { height: 24, width: '80%', x: 14, y: 9 },
        codeText(14)
      ),
      textNode(
        'subline',
        'field:subline',
        { height: 20, width: '80%', x: 14, y: 34 },
        metaText(11)
      ),
    ]),
  ]);
}

export function timelineSceneTree() {
  return group([
    rectNode('panel', { height: '100%', width: '100%', x: 0, y: 0 }, opsPanel(10)),
    textNode(
      'headline',
      'field:headline',
      { height: 34, width: '72%', x: '8%', y: '24%' },
      codeText(26)
    ),
    textNode(
      'subline',
      'field:subline',
      { height: 24, width: '50%', x: '8%', y: '43%' },
      metaText(13)
    ),
    {
      frame: { height: 6, width: '72%', x: '8%', y: '66%' },
      id: 'progress',
      nodeType: VideoAnnotationRenderNodeKind.PROGRESS,
      props: { progress: 0 },
      style: { backgroundFill: 'rgba(23,20,18,0.12)', fill: 'token:accent' },
    },
  ]);
}
