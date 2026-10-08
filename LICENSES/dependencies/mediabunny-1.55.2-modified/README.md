# Modified Mediabunny corresponding source

This archive accompanies Mediabunny 1.55.2, licensed MPL-2.0. Preserve LICENSE and the original source headers. Sniptale adds an optional validated 48 kHz processed-audio window for AAC fragmented MP4 and Opus WebM; Opus pre-skip is derived from decoder configuration. The changed TypeScript files are listed in patch-manifest.json and included in full in patch-payload.json.gz. source.patch is the reviewable source delta.

Unmodified upstream source: https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.2.tgz

Upstream package integrity: sha512-EEx4O6qYddAdCyWPMZNDwI7uc5hewNHrPAf9jLcVhIbXoPsiqNQ+D9i1pfadmGkjN2V318jSrZljkpoziYm6Lg==

The upstream tarball alone is not the modified corresponding source. Combine it with these supplied modifications. patch-payload.json.gz is gzip-compressed UTF-8 JSON: keys are package-relative paths, values are full replacement text. It includes all modified TypeScript sources, declarations and distribution bundles. Decode it with Node's gunzipSync and JSON.parse; inspect the src/ entries directly. To reconstruct the exact installed package, extract the integrity-verified upstream tarball, check every target against beforeSha256 in patch-manifest.json, write the corresponding replacement text, and verify every resulting afterSha256. Do not evaluate the JSON text as JavaScript. Paths must remain within the extracted package. A completely reconstructed package must match all manifest result hashes.

The manifest also binds the compressed payload, source patch and license hashes. Rebuild provenance: Node 24.18.0, TypeScript 6.0.3, esbuild 0.28.2. Sources were compiled as ES2022/ESNext with explicit relative .js imports; declarations/maps were emitted using the shipped shared declarations; all browser and Node bundles were rebuilt from the ESM index, preserving the browser Node/fs exclusion. The complete replacement distribution is supplied so reconstruction does not require a compiler download. No runtime monkey patch or separate muxer is required.
