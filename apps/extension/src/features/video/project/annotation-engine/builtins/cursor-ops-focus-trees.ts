import { VideoAnnotationRenderNodeKind } from '../types';
import { group, rectNode, textNode } from './helpers';
import { codeText, metaText, opsPanel, statusFill } from './cursor-ops-style';

export function scanFrameTree() {
  return group([
    {
      id: 'target-frame',
      nodeType: VideoAnnotationRenderNodeKind.FRAME,
      props: { target: 'rect', variant: 'bracket' },
      style: { stroke: 'token:accent', strokeWidth: 2 },
    },
    rectNode('panel', { height: 40, width: '36%', x: '6%', y: '6%' }, opsPanel(6), [
      textNode(
        'headline',
        'field:headline',
        { height: 28, width: '84%', x: 12, y: 6 },
        { ...metaText(12), paddingX: 2 }
      ),
    ]),
    rectNode(
      'scanline',
      { height: 2, width: '100%', x: 0, y: '50%' },
      { fill: 'token:accent', radius: 0 }
    ),
  ]);
}

export function diffSpotlightTree() {
  return group([
    {
      id: 'target-frame',
      nodeType: VideoAnnotationRenderNodeKind.FRAME,
      props: { target: 'rect' },
      style: { radius: 6, stroke: 'token:accent', strokeWidth: 2 },
    },
    {
      id: 'target-glow',
      nodeType: VideoAnnotationRenderNodeKind.SPOTLIGHT,
      props: { target: 'rect' },
      style: { fill: 'rgba(249,115,22,0.12)', stroke: 'rgba(249,115,22,0.42)', strokeWidth: 1 },
    },
    rectNode('panel', { height: 90, width: '38%', x: '58%', y: '9%' }, opsPanel(8), [
      rectNode('add', { height: 18, width: '30%', x: 12, y: 12 }, statusFill('token:changeAdd')),
      rectNode(
        'remove',
        { height: 18, width: '22%', x: '42%', y: 12 },
        statusFill('token:changeRemove')
      ),
      textNode(
        'headline',
        'field:headline',
        { height: 26, width: '78%', x: 14, y: 40 },
        codeText(16)
      ),
      textNode(
        'subline',
        'field:subline',
        { height: 22, width: '78%', x: 14, y: 64 },
        metaText(10)
      ),
    ]),
  ]);
}
