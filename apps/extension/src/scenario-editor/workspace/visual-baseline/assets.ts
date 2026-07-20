import type { ScenarioAssetEntry } from '../../../composition/persistence/scenario/contracts';
import {
  SCENARIO_VISUAL_BASELINE_CAPTURE_ASSET_ID,
  SCENARIO_VISUAL_BASELINE_IMPORTED_ASSET_ID,
  SCENARIO_VISUAL_BASELINE_TIME,
} from './constants';

export function createScenarioVisualBaselineAssets(projectId: string): ScenarioAssetEntry[] {
  return [
    createAsset({
      height: 900,
      id: SCENARIO_VISUAL_BASELINE_CAPTURE_ASSET_ID,
      projectId,
      svg: createCapturedAppSvg(),
      width: 1440,
    }),
    createAsset({
      height: 720,
      id: SCENARIO_VISUAL_BASELINE_IMPORTED_ASSET_ID,
      projectId,
      svg: createImportedImageSvg(),
      width: 1280,
    }),
  ];
}

function createAsset(args: {
  height: number;
  id: string;
  projectId: string;
  svg: string;
  width: number;
}): ScenarioAssetEntry {
  const blob = new Blob([args.svg], { type: 'image/svg+xml' });
  return {
    blob,
    createdAt: SCENARIO_VISUAL_BASELINE_TIME,
    galleryAssetId: null,
    height: args.height,
    id: args.id,
    mimeType: 'image/svg+xml',
    projectId: args.projectId,
    size: blob.size,
    width: args.width,
  };
}

function createCapturedAppSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">',
    '<rect width="1440" height="900" fill="#f7f2ea"/>',
    '<rect x="48" y="56" width="1344" height="88" rx="22" fill="#ffffff" stroke="#ddd2c4"/>',
    '<text x="86" y="112" fill="#332c25" font-family="Arial" font-size="30" ' +
      'font-weight="700">Customer workspace</text>',
    '<rect x="88" y="192" width="364" height="596" rx="26" fill="#ffffff" stroke="#dfd4c5"/>',
    '<rect x="508" y="192" width="792" height="126" rx="26" fill="#fffaf2" stroke="#dfd4c5"/>',
    '<rect x="508" y="360" width="374" height="428" rx="26" fill="#ffffff" stroke="#dfd4c5"/>',
    '<rect x="926" y="360" width="374" height="428" rx="26" fill="#ffffff" stroke="#dfd4c5"/>',
    '<rect x="1114" y="84" width="204" height="44" rx="14" fill="#ef6c2f"/>',
    '<text x="1142" y="114" fill="#ffffff" font-family="Arial" font-size="19" font-weight="700">Create scenario</text>',
    '<text x="128" y="254" fill="#5b5147" font-family="Arial" font-size="22" font-weight="700">Accounts</text>',
    '<text x="544" y="248" fill="#443b33" font-family="Arial" font-size="38" ' +
      'font-weight="700">Q2 activation plan</text>',
    '<text x="544" y="286" fill="#73685d" font-family="Arial" font-size="20">' +
      'Hatiqo-like operational screen captured for deck authoring</text>',
    '<rect x="548" y="430" width="284" height="82" rx="18" fill="#f1e7d8"/>',
    '<rect x="548" y="540" width="284" height="82" rx="18" fill="#e7eef4"/>',
    '<rect x="966" y="430" width="284" height="82" rx="18" fill="#f1e7d8"/>',
    '<rect x="966" y="540" width="284" height="82" rx="18" fill="#e7eef4"/>',
    '</svg>',
  ].join('');
}

function createImportedImageSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">',
    '<rect width="1280" height="720" fill="#edf4f8"/>',
    '<rect x="88" y="74" width="1104" height="572" rx="34" fill="#ffffff" stroke="#cad9e2"/>',
    '<circle cx="220" cy="198" r="58" fill="#2f6f9f" opacity="0.86"/>',
    '<rect x="320" y="154" width="656" height="44" rx="16" fill="#d9e7ef"/>',
    '<rect x="320" y="230" width="772" height="34" rx="14" fill="#eef4f8"/>',
    '<rect x="176" y="352" width="244" height="168" rx="24" fill="#f4e8d6"/>',
    '<rect x="472" y="352" width="244" height="168" rx="24" fill="#e3edf3"/>',
    '<rect x="768" y="352" width="244" height="168" rx="24" fill="#f4e8d6"/>',
    '<text x="176" y="596" fill="#334155" font-family="Arial" font-size="26" ' +
      'font-weight="700">Imported product screenshot</text>',
    '</svg>',
  ].join('');
}
