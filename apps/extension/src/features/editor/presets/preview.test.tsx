/* eslint-disable max-lines-per-function -- preview renderer proof keeps family branches in one place */
import ReactDOMServer from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../document/constants';
import { renderBorderPresetPreview, renderEditorPresetPreview } from './preview';

describe('editor preset preview renderer', () => {
  it('renders previews for every editor preset family and the border preset seam', () => {
    const pencil = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('pencil', {
        id: 'pencil',
        name: 'Pencil',
        order: 0,
        enabled: true,
        settings: {
          color: '#111111',
          opacity: 0.6,
          shapeCorrection: 'subtle',
          shadow: 0,
          smoothingLevel: 4,
          width: 12,
        },
      })
    );
    const ellipse = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('ellipse', {
        id: 'ellipse',
        name: 'Ellipse',
        order: 0,
        enabled: true,
        settings: {
          borderPresetId: null,
          customCss: '',
          fillColor: '#222222',
          fillOpacity: 0.4,
          inheritCustomCss: false,
          opacity: 0.7,
          radius: 0,
          shadow: 30,
          strokeColor: '#333333',
          strokeOpacity: 0.8,
          strokeStyle: 'solid',
          strokeWidth: 6,
        },
      })
    );
    const highlighter = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('highlighter', {
        id: 'highlighter',
        name: 'Highlighter',
        order: 0,
        enabled: true,
        settings: {
          color: '#121212',
          opacity: 0.4,
          shapeCorrection: 'off',
          shadow: 0,
          smoothingLevel: 2,
          width: 6,
        },
      })
    );
    const blur = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('blur', {
        id: 'blur',
        name: 'Blur',
        order: 0,
        enabled: true,
        settings: {
          amount: 14,
          blurType: 'pixelate',
          showBorder: true,
        },
      })
    );
    const blurDistortion = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('blur', {
        id: 'blur-distortion',
        name: 'Blur Distortion',
        order: 1,
        enabled: true,
        settings: {
          amount: 12,
          blurType: 'distortion',
          showBorder: true,
        },
      })
    );
    const blurSolid = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('blur', {
        id: 'blur-solid',
        name: 'Blur Solid',
        order: 2,
        enabled: true,
        settings: {
          amount: 12,
          blurType: 'solid',
          showBorder: true,
        },
      })
    );
    const blurGaussian = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('blur', {
        id: 'blur-gaussian',
        name: 'Blur Gaussian',
        order: 3,
        enabled: true,
        settings: {
          amount: 12,
          blurType: 'gaussian',
          showBorder: true,
        },
      })
    );
    const arrow = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('arrow', {
        id: 'arrow',
        name: 'Arrow',
        order: 0,
        enabled: true,
        settings: {
          color: '#444444',
          endHead: 'triangle',
          mode: 'straight',
          opacity: 0.9,
          shadow: 50,
          startHead: 'none',
          variant: 'standard',
          width: 8,
        },
      })
    );
    const text = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('text', {
        id: 'text',
        name: 'Text',
        order: 0,
        enabled: true,
        settings: {
          backgroundColor: '#555555',
          backgroundOpacity: 0.4,
          calloutFormat: 'panel',
          layoutMode: 'fixed-width' as const,
          fontFamily: 'Arial' as never,
          fontSize: 20,
          fontStyle: 'normal' as const,
          fontWeight: 'bold' as const,
          shadow: 0,
          shadowAngle: 90,
          shadowColor: '#ffffff',
          textAlign: 'left' as const,
          verticalAlign: 'top' as const,
          textColor: '#ffffff',
          textOpacity: 1,
          underline: false,
          linethrough: false,
          tailSize: 12,
        },
      })
    );
    const step = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('step', {
        id: 'step',
        name: 'Step',
        order: 0,
        enabled: true,
        settings: {
          alphabet: 'latin',
          color: '#666666',
          opacity: 1,
          sizeLevel: 3,
          strokeColor: '#f8fafc',
          strokeOpacity: 1,
          strokeWidth: 2,
          textColor: '#ffffff',
          type: 'number',
          value: '7',
        },
      })
    );
    const scene = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('sceneBackground', {
        id: 'scene',
        name: 'Scene',
        order: 0,
        enabled: true,
        settings: {
          paddingTop: 128,
          paddingRight: 128,
          paddingBottom: 128,
          paddingLeft: 128,
          backgroundMode: 'gradient',
          backgroundColor: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundColor,
          backgroundGradientAngle: 90,
          backgroundGradientFrom: '#101010',
          backgroundGradientStops: ['#101010', '#808080', '#f0f0f0'],
          backgroundGradientTo: '#f0f0f0',
          backgroundImageData: null,
          backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
          layoutMode: 'expand-canvas',
        },
      })
    );
    const border = ReactDOMServer.renderToStaticMarkup(
      renderBorderPresetPreview({
        id: 'border',
        name: 'Border',
        order: 0,
        enabled: true,
        width: 4,
        color: '#777777',
        style: 'solid',
        radius: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        shadow: 0,
        opacity: 100,
        strokeOpacity: 100,
        fillColor: '#888888',
        fillOpacity: 20,
        inheritCustomCss: false,
        customCss: '',
      })
    );
    const sceneColor = ReactDOMServer.renderToStaticMarkup(
      renderEditorPresetPreview('sceneBackground', {
        id: 'scene-color',
        name: 'Scene Color',
        order: 0,
        enabled: true,
        settings: {
          paddingTop: 128,
          paddingRight: 128,
          paddingBottom: 128,
          paddingLeft: 128,
          backgroundMode: 'color',
          backgroundColor: '#0f0f0f',
          backgroundGradientAngle: 90,
          backgroundGradientFrom: '#101010',
          backgroundGradientTo: '#f0f0f0',
          backgroundImageData: null,
          backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
          layoutMode: 'expand-canvas',
        },
      })
    );

    expect(pencil).toContain('#11111199');
    expect(ellipse).toContain('border-width:3px');
    expect(highlighter).toContain('#12121266');
    expect(blur).toContain('background-size:4px 4px');
    expect(blurDistortion).toContain('repeating-linear-gradient');
    expect(blurSolid).toContain('background-color:rgb(15 23 42 / 0.480)');
    expect(blurGaussian).toContain('filter:blur(0.6px)');
    expect(arrow).toContain('<svg');
    expect(text).toContain('>T<');
    expect(step).toContain('>7<');
    expect(scene).toContain('linear-gradient(90deg, #101010 0%, #808080 50%, #f0f0f0 100%)');
    expect(sceneColor).toContain('background:#0f0f0f');
    expect(border).toContain('#777777ff');
  });
});
