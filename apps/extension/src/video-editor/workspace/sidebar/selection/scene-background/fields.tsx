import { translate } from '../../../../../platform/i18n';
import { VideoSceneBackgroundKind } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { SelectInput } from '../shared/controls';
import { PANEL_META_CLASS_NAME } from '../shared/panel';
import { SceneBackgroundColorEditor } from './colors';
import type { SceneBackground, SceneBackgroundFieldProps } from './shared';

export function SceneBackgroundFields(props: SceneBackgroundFieldProps) {
  return (
    <div className="grid gap-3">
      <SelectInput
        label={translate('videoEditor.sidebar.sceneBackgroundTypeLabel')}
        value={props.sceneBackground.kind}
        onChange={(value) => handleSceneBackgroundKindChange(value, props)}
        options={getSceneBackgroundKindOptions(props.imageAssets)}
      />
      <SceneBackgroundEditor {...props} />
    </div>
  );
}

function SceneBackgroundEditor(props: SceneBackgroundFieldProps) {
  switch (props.sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return <SceneBackgroundColorEditor {...props} />;
    case VideoSceneBackgroundKind.GRADIENT:
      return <SceneBackgroundColorEditor {...props} />;
    case VideoSceneBackgroundKind.IMAGE:
      return <ImageBackgroundEditor {...props} />;
  }
}

function ImageBackgroundEditor(props: SceneBackgroundFieldProps) {
  if (props.sceneBackground.kind !== VideoSceneBackgroundKind.IMAGE) {
    return null;
  }

  if (props.imageAssets.length === 0) {
    return (
      <p className={PANEL_META_CLASS_NAME}>
        {translate('videoEditor.sidebar.sceneBackgroundImageEmpty')}
      </p>
    );
  }

  return (
    <SelectInput
      label={translate('videoEditor.sidebar.sceneBackgroundImageAssetLabel')}
      value={props.sceneBackground.assetId}
      onChange={(value) => commitSceneBackgroundImage(value, props)}
      options={getSceneBackgroundAssetOptions(props.imageAssets)}
    />
  );
}

function handleSceneBackgroundKindChange(
  nextKind: SceneBackground['kind'],
  props: SceneBackgroundFieldProps
) {
  switch (nextKind) {
    case VideoSceneBackgroundKind.SOLID:
      props.onSetSceneBackground(resolveSolidSceneBackground(props.sceneBackground));
      props.onResetSceneBackgroundPreview();
      return;
    case VideoSceneBackgroundKind.GRADIENT:
      props.onSetSceneBackground(resolveGradientSceneBackground(props.sceneBackground));
      props.onResetSceneBackgroundPreview();
      return;
    case VideoSceneBackgroundKind.IMAGE: {
      const firstAsset = props.imageAssets[0];
      if (!firstAsset) {
        return;
      }

      props.onSetSceneBackground({
        kind: VideoSceneBackgroundKind.IMAGE,
        assetId: firstAsset.id,
      });
      props.onResetSceneBackgroundPreview();
    }
  }
}

function resolveSolidSceneBackground(sceneBackground: SceneBackground) {
  return {
    kind: VideoSceneBackgroundKind.SOLID,
    color:
      sceneBackground.kind === VideoSceneBackgroundKind.SOLID ? sceneBackground.color : '#111111',
  } as const;
}

function resolveGradientSceneBackground(sceneBackground: SceneBackground) {
  const from =
    sceneBackground.kind === VideoSceneBackgroundKind.GRADIENT ? sceneBackground.from : '#111111';
  const to =
    sceneBackground.kind === VideoSceneBackgroundKind.GRADIENT ? sceneBackground.to : '#334155';
  return {
    kind: VideoSceneBackgroundKind.GRADIENT,
    from,
    to,
    angle: sceneBackground.kind === VideoSceneBackgroundKind.GRADIENT ? sceneBackground.angle : 135,
    stops:
      sceneBackground.kind === VideoSceneBackgroundKind.GRADIENT
        ? sceneBackground.stops
        : [
            { color: from, offset: 0 },
            { color: to, offset: 1 },
          ],
  } as const;
}

function commitSceneBackgroundImage(
  assetId: string,
  props: Pick<SceneBackgroundFieldProps, 'onResetSceneBackgroundPreview' | 'onSetSceneBackground'>
) {
  props.onSetSceneBackground({
    kind: VideoSceneBackgroundKind.IMAGE,
    assetId,
  });
  props.onResetSceneBackgroundPreview();
}

export function getSceneBackgroundKindOptions(
  imageAssets: SceneBackgroundFieldProps['imageAssets'] = []
) {
  return [
    {
      value: VideoSceneBackgroundKind.SOLID,
      label: translate('videoEditor.sidebar.sceneBackgroundSolid'),
    },
    {
      value: VideoSceneBackgroundKind.GRADIENT,
      label: translate('videoEditor.sidebar.sceneBackgroundGradient'),
    },
    {
      value: VideoSceneBackgroundKind.IMAGE,
      label: translate('videoEditor.sidebar.sceneBackgroundImage'),
      disabled: imageAssets.length === 0,
    },
  ];
}

export function getSceneBackgroundAssetOptions(
  imageAssets: SceneBackgroundFieldProps['imageAssets']
) {
  return imageAssets.map((asset) => ({
    value: asset.id,
    label: asset.name,
  }));
}

export function getSceneBackgroundSummaryLabel(
  sceneBackground: SceneBackground,
  project: WorkspaceSidebarSelectionPanelProps['project']
) {
  switch (sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return sceneBackground.color;
    case VideoSceneBackgroundKind.GRADIENT:
      return (
        sceneBackground.stops ?? [
          { color: sceneBackground.from, offset: 0 },
          { color: sceneBackground.to, offset: 1 },
        ]
      )
        .map((stop) => stop.color)
        .join(' -> ');
    case VideoSceneBackgroundKind.IMAGE:
      return (
        project.assets.find((asset) => asset.id === sceneBackground.assetId)?.name ??
        sceneBackground.assetId
      );
  }
}
