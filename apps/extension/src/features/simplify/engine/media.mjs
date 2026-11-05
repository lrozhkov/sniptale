import { rejectPlanarMedia } from './planar-surfaces.mjs';
import {
  detectSurfaces,
  alignMediaSurfaceBottoms,
  alignMediaSurfaceSides,
} from './media-surfaces.mjs';
import { detectGraphics, darkComponents, detectSmallImageGroups } from './media-components.mjs';
import { detectLightProductSurfaces, detectClippedFramedImages } from './media-frames.mjs';
import { detectIllustrationIslands } from './media-illustrations.mjs';
import { detectLocalTexturedObjects, detectCompound } from './media-texture.mjs';

export function detectMedia(image, measure, sourceRows = [], scratch = null) {
  const queue =
    scratch && scratch.length >= image.width * image.height
      ? scratch
      : new Int32Array(image.width * image.height);
  const proposals = detectSurfaces(image),
    surfaces = measure ? rejectPlanarMedia(image, proposals, measure, sourceRows) : proposals,
    graphics = detectGraphics(image, queue);
  alignMediaSurfaceBottoms(image, surfaces);
  alignMediaSurfaceSides(image, surfaces);
  const existing = [
    ...surfaces,
    ...graphics.filter(
      (g) =>
        !surfaces.some(
          (s) => g.x < s.x + s.w && g.x + g.w > s.x && g.y < s.y + s.h && g.y + g.h > s.y
        )
    ),
  ];
  const rasterComponents = darkComponents(image, queue);
  const islands = detectIllustrationIslands(image, existing, rasterComponents);
  const complete = existing.filter(
    (s) =>
      !islands.some(
        (p) => s.x >= p.x && s.y >= p.y && s.x + s.w <= p.x + p.w && s.y + s.h <= p.y + p.h
      )
  );
  const products = detectLightProductSurfaces(image, queue).filter(
    (p) =>
      !complete.some((s) => {
        const iw = Math.max(0, Math.min(p.x + p.w, s.x + s.w) - Math.max(p.x, s.x)),
          ih = Math.max(0, Math.min(p.y + p.h, s.y + s.h) - Math.max(p.y, s.y));
        return iw * ih > Math.min(p.w * p.h, s.w * s.h) * 0.3;
      })
  );
  const framed = detectClippedFramedImages(image).filter(
    (p) =>
      ![...complete, ...islands, ...products].some((s) => {
        const iw = Math.max(0, Math.min(p.x + p.w, s.x + s.w) - Math.max(p.x, s.x));
        const ih = Math.max(0, Math.min(p.y + p.h, s.y + s.h) - Math.max(p.y, s.y));
        return iw * ih > Math.min(p.w * p.h, s.w * s.h) * 0.3;
      })
  );
  const small = detectSmallImageGroups(image, rasterComponents).filter(
    (p) =>
      ![...complete, ...islands, ...products, ...framed].some(
        (s) => p.x < s.x + s.w && p.x + p.w > s.x && p.y < s.y + s.h && p.y + p.h > s.y
      )
  );
  const established = [...complete, ...islands, ...products, ...framed, ...small];
  const local = detectLocalTexturedObjects(image, queue).filter(
    (p) =>
      !established.some(
        (s) => p.x < s.x + s.w && p.x + p.w > s.x && p.y < s.y + s.h && p.y + p.h > s.y
      )
  );
  const compound = detectCompound(image, [...established, ...local], queue);
  return [...established, ...local, ...compound];
}
