export function didSurfaceGrow(surface, previousSurface) {
  return previousSurface ? surface.members > previousSurface.members : true;
}

export function collectSurfaceMaps({
  filePath,
  relativePath,
  currentSourceFile,
  collectSurfaces,
  resolvePreviousSource,
  createPreviousSourceFile,
}) {
  const currentSurfaces = collectSurfaces(currentSourceFile);
  const previousText = resolvePreviousSource(relativePath);
  const previousSurfaces = previousText
    ? collectSurfaces(createPreviousSourceFile(filePath, previousText))
    : new Map();

  return {
    currentSurfaces,
    previousSurfaces,
  };
}
