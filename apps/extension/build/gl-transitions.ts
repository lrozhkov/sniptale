import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const ROOT = dirname(require.resolve('gl-transitions'));
const CATALOG = fileURLToPath(
  new URL(
    '../../../apps/extension/src/features/video/project/transition/gl-catalog.generated.json',
    import.meta.url
  )
);
const ID = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u);
const number = z.number().finite();
const uniformType = z.enum(['bool', 'float', 'int', 'ivec2', 'vec2', 'vec3', 'vec4']);
const value = z.union([number, z.boolean(), z.array(number).min(2).max(4)]);
const parameter = z.strictObject({
  type: uniformType,
  default: value,
  description: z.string().optional(),
  min: number.optional(),
  max: number.optional(),
  step: number.positive().optional(),
  color: z.boolean().optional(),
});
const entry = z.object({
  name: ID,
  params: z.record(ID, parameter),
  author: z.string(),
  license: z.enum(['MIT', 'BSD 2 Clause', 'BSD 3 Clause']),
  description: z.string(),
  tags: z.array(z.string()),
  textures: z.array(ID).max(1),
});
const layout = z.strictObject({
  uniforms: z
    .array(z.strictObject({ name: ID, type: uniformType, offset: number.int().min(0) }))
    .max(64),
  size: number.int().positive().max(4096),
  textures: z.array(ID).max(1),
});
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Decode premultiplied composition inputs after filtering; upstream transition math uses straight RGBA. */
function adaptWgsl(source: string): string {
  if (source.includes('_sniptaleSample')) throw new Error('GL shader adapter name collision.');
  return (
    source.replaceAll('textureSampleLevel(', '_sniptaleSample(') +
    `
fn _sniptaleSample(image: texture_2d<f32>, filtering: sampler, uv: vec2<f32>, level: f32) -> vec4<f32> {
  let pixel = textureSampleLevel(image, filtering, uv, level);
  if (pixel.a <= 0.0) { return vec4<f32>(0.0); }
  return vec4<f32>(pixel.rgb / pixel.a, pixel.a);
}
`
  );
}
function texture(name: 'displacementMap' | 'luma'): Uint8Array {
  const bytes = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const offset = (y * 64 + x) * 4;
      const value =
        name === 'luma'
          ? Math.round((255 * (x + y)) / 126)
          : Math.round(127.5 + 127.5 * Math.sin(x * 0.31) * Math.cos(y * 0.23));
      bytes.set([value, value, value, 255], offset);
    }
  return bytes;
}

/** Emit only the pinned browser shader languages and bounded local resources, with reproducible identities. */
export async function buildGlTransitionCatalog() {
  const metadata = z
    .object({ version: z.literal('3.2.0') })
    .parse(JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')));
  const entries = z
    .array(entry)
    .length(214)
    .parse(JSON.parse(await readFile(resolve(ROOT, 'gl-transitions.json'), 'utf8')));
  const layouts = z
    .record(ID, layout)
    .parse(JSON.parse(await readFile(resolve(ROOT, 'layouts.json'), 'utf8')));
  if (new Set(entries.map((item) => item.name)).size !== 214 || Object.keys(layouts).length !== 214)
    throw new Error('GL transition inventory is incomplete.');
  const assets = new Map<string, string | Uint8Array>();
  const shaders = [];
  for (const item of entries) {
    const uniforms = layouts[item.name];
    if (!uniforms || JSON.stringify(item.textures) !== JSON.stringify(uniforms.textures))
      throw new Error(`GL layout differs: ${item.name}`);
    const wgsl = adaptWgsl(await readFile(resolve(ROOT, `wgsl/${item.name}.wgsl`), 'utf8'));
    const glsl3 = await readFile(resolve(ROOT, `glsl3/${item.name}.glsl`), 'utf8');
    const wgslPath = `video-effects/transitions/wgsl/${item.name}.wgsl`;
    const glsl3Path = `video-effects/transitions/glsl3/${item.name}.glsl`;
    assets.set(wgslPath, wgsl);
    assets.set(glsl3Path, glsl3);
    for (const uniform of uniforms.uniforms) {
      if (uniform.name === 'progress' || uniform.name === 'ratio') continue;
      if (item.params[uniform.name]?.type !== uniform.type)
        throw new Error(`GL parameter differs: ${item.name}.${uniform.name}`);
    }
    shaders.push({
      ...item,
      layout: uniforms,
      implementation: {
        package: 'gl-transitions',
        version: metadata.version,
        adapter: 1,
        wgsl: { path: wgslPath, sha256: digest(wgsl) },
        glsl3: { path: glsl3Path, sha256: digest(glsl3) },
      },
    });
  }
  const resources = (['displacementMap', 'luma'] as const).map((name) => {
    const bytes = texture(name),
      path = `video-effects/transitions/textures/${name}.rgba`;
    assets.set(path, bytes);
    return { name, path, width: 64, height: 64, sha256: digest(bytes) };
  });
  const catalog = {
    package: 'gl-transitions',
    version: metadata.version,
    adapter: 1,
    resources,
    transitions: shaders,
  };
  const serialized = JSON.stringify(catalog, null, 2) + '\n';
  const previous = await readFile(CATALOG, 'utf8').catch(() => '');
  if (previous !== serialized) await writeFile(CATALOG, serialized);
  return { catalog, assets };
}

export function glTransitions(): Plugin {
  let prepared: Awaited<ReturnType<typeof buildGlTransitionCatalog>> | undefined;
  let building = false;
  return {
    name: 'sniptale:gl-transitions',
    configResolved(config) {
      building = config.command === 'build';
    },
    async buildStart() {
      prepared = await buildGlTransitionCatalog();
      if (building)
        for (const [fileName, source] of prepared.assets)
          this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.middlewares.use('/video-effects/transitions/', async (request, response, next) => {
        try {
          prepared ??= await buildGlTransitionCatalog();
          const asset = prepared.assets.get(
            `video-effects/transitions/${request.url?.split('?')[0]?.replace(/^\//u, '')}`
          );
          if (asset === undefined) {
            next();
            return;
          }
          response.setHeader(
            'Content-Type',
            typeof asset === 'string' ? 'text/plain; charset=utf-8' : 'application/octet-stream'
          );
          response.end(asset);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await buildGlTransitionCatalog();
