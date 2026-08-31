const RETIRED_EFFECT_FILE_RULES = [
  {
    message: 'retired Engine1 artifact',
    pattern:
      /(?:^|\/)(?:package-renderer-sandbox|video-pack|template-packs|package-renderer-cache)(?:\/|$)/u,
  },
  {
    message: 'SDK handoff or golden artifact',
    pattern: /(?:^|\/)(?:extension-engine2-(?:handoff|current-delta)|goldens?)(?:\/|$)/iu,
  },
  {
    message: 'retired bundled SDK demo artifact',
    pattern: /(?:^|\/)sniptale\.sdk\.[^/]+(?:\/|$)/u,
  },
];

const RETIRED_EFFECT_SOURCE_PATHS = [
  'package-renderer-sandbox',
  'features/video/project/video-pack',
  'composition/persistence/template-packs',
  'package-renderer-cache',
];

export function verifyRetiredEffectArtifactPath(relativePath) {
  const rule = RETIRED_EFFECT_FILE_RULES.find(({ pattern }) => pattern.test(relativePath));
  if (rule) throw new Error(`Release artifact contains forbidden ${rule.message}: ${relativePath}`);
}

export function verifyRetiredEffectArtifactText(relativePath, text) {
  if (RETIRED_EFFECT_SOURCE_PATHS.some((path) => text.includes(path))) {
    throw new Error(
      `Release artifact ${relativePath} contains forbidden retired Engine1 source path.`
    );
  }
}
