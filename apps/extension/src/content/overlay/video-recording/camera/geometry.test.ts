import { describe, expect, it } from 'vitest';
import { WEBCAM_DOCK_POSITIONS } from '@sniptale/runtime-contracts/video/types/types';
import {
  constrainEmbeddedCameraGeometry,
  DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
  pickEmbeddedCameraGeometry,
  resizeEmbeddedCameraGeometry,
  getEmbeddedCameraCorner,
  findEmbeddedCameraDockPosition,
  getEmbeddedCameraDockPositions,
  getEmbeddedCameraDockMarker,
} from './geometry';

describe('embedded recording camera geometry', () => {
  it.each(WEBCAM_DOCK_POSITIONS)(
    'retains explicit anchor %s for both camera shapes',
    (dockPosition) => {
      for (const shape of ['circle', 'rectangle', 'square'] as const) {
        for (const viewport of [
          { width: 1280, height: 560 },
          { width: 1920, height: 900 },
          { width: 480, height: 900 },
        ]) {
          const geometry = constrainEmbeddedCameraGeometry(
            {
              ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
              dockPosition,
              shape,
              sizeFraction: 0.55,
            },
            viewport
          );
          const marker = getEmbeddedCameraDockMarker(geometry, dockPosition, viewport);
          if (getEmbeddedCameraDockPositions(viewport).includes(dockPosition))
            expect(
              findEmbeddedCameraDockPosition({ ...geometry, center: marker.center }, viewport)
            ).toBe(dockPosition);
          const along = dockPosition.endsWith('25')
            ? 0.25
            : dockPosition.endsWith('75')
              ? 0.75
              : 0.5;
          const width = geometry.sizeFraction * Math.min(viewport.width, viewport.height);
          const height = shape === 'circle' || shape === 'square' ? width : (width * 9) / 16;
          const horizontal = dockPosition.includes('w')
            ? 12 + width / 2
            : dockPosition.includes('e')
              ? viewport.width - 12 - width / 2
              : Math.max(
                  12 + width / 2,
                  Math.min(viewport.width - 12 - width / 2, viewport.width * along)
                );
          const vertical = dockPosition.includes('n')
            ? 12 + height / 2
            : dockPosition.includes('s')
              ? viewport.height - 12 - height / 2
              : Math.max(
                  12 + height / 2,
                  Math.min(viewport.height - 12 - height / 2, viewport.height * along)
                );
          expect(geometry.center.x * viewport.width).toBeCloseTo(horizontal);
          expect(geometry.center.y * viewport.height).toBeCloseTo(vertical);
          expect(pickEmbeddedCameraGeometry(geometry).dockPosition).toBe(dockPosition);
        }
      }
    }
  );
  it('offers twelve anchors with quarter choices along the current long edges', () => {
    const wide = getEmbeddedCameraDockPositions({ width: 1280, height: 560 });
    const tall = getEmbeddedCameraDockPositions({ width: 480, height: 900 });
    expect(wide).toHaveLength(12);
    expect(tall).toHaveLength(12);
    expect(wide).toEqual(expect.arrayContaining(['n25', 'n75', 's25', 's75']));
    expect(tall).toEqual(expect.arrayContaining(['w25', 'w75', 'e25', 'e75']));
    expect(wide).not.toContain('w25');
    expect(tall).not.toContain('n25');
  });
  it.each(['nw', 'ne', 'sw', 'se'] as const)(
    'keeps %s inset through viewport and size changes',
    (corner) => {
      for (const shape of ['circle', 'rectangle'] as const) {
        for (const viewport of [
          { width: 1280, height: 560 },
          { width: 1920, height: 900 },
          { width: 320, height: 240 },
        ]) {
          for (const sizeFraction of [0.12, 0.55]) {
            const geometry = constrainEmbeddedCameraGeometry(
              {
                ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
                shape,
                sizeFraction,
                center: { x: corner.includes('w') ? 0 : 1, y: corner.includes('n') ? 0 : 1 },
              },
              viewport
            );
            const width = sizeFraction * Math.min(viewport.width, viewport.height);
            const height = shape === 'circle' ? width : (width * 9) / 16;
            expect(getEmbeddedCameraCorner(geometry)).toBe(corner);
            expect(
              Math.abs(
                geometry.center.x * viewport.width -
                  (corner.includes('w') ? width / 2 : viewport.width - width / 2)
              )
            ).toBeCloseTo(12);
            expect(
              Math.abs(
                geometry.center.y * viewport.height -
                  (corner.includes('n') ? height / 2 : viewport.height - height / 2)
              )
            ).toBeCloseTo(12);
          }
        }
      }
    }
  );

  it('preserves free centers and temporarily permits undocked drag previews', () => {
    const geometry = { ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY, center: { x: 0.45, y: 0.4 } };
    const viewport = { width: 1280, height: 560 };
    expect(
      constrainEmbeddedCameraGeometry({ ...geometry, freePlacement: true }, viewport).center
    ).toEqual(geometry.center);
    expect(constrainEmbeddedCameraGeometry(geometry, viewport, false).center).toEqual(
      geometry.center
    );
    expect(pickEmbeddedCameraGeometry({ ...geometry, freePlacement: true }).freePlacement).toBe(
      true
    );
  });
  it('removes durable presentation fields before sending geometry commands', () => {
    const geometry = pickEmbeddedCameraGeometry({
      ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
      mode: 'embedded',
    } as typeof DEFAULT_EMBEDDED_CAMERA_GEOMETRY & { mode: 'embedded' });

    expect(geometry).toEqual(DEFAULT_EMBEDDED_CAMERA_GEOMETRY);
    expect(geometry).not.toHaveProperty('mode');
  });

  it('keeps the complete fixed-ratio camera inside the viewport', () => {
    const constrained = constrainEmbeddedCameraGeometry(
      {
        ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
        center: { x: 1, y: 1 },
        cropOffset: { x: 4, y: -4 },
        shape: 'rectangle',
        sizeFraction: 0.8,
      },
      { width: 1200, height: 800 }
    );

    expect(constrained.sizeFraction).toBe(0.55);
    expect(constrained.center.x).toBeLessThan(1);
    expect(constrained.center.y).toBeLessThan(1);
    expect(constrained.cropOffset).toEqual({ x: 1, y: -1 });
  });

  it.each([
    ['nw', { x: -80, y: -80 }],
    ['ne', { x: 80, y: -80 }],
    ['se', { x: 80, y: 80 }],
    ['sw', { x: -80, y: 80 }],
  ] as const)('grows from the %s corner without changing the shape ratio', (corner, delta) => {
    const resized = resizeEmbeddedCameraGeometry(DEFAULT_EMBEDDED_CAMERA_GEOMETRY, corner, delta, {
      width: 1200,
      height: 800,
    });

    expect(resized.sizeFraction).toBeCloseTo(0.32);
    expect(resized.shape).toBe('circle');
  });
});
