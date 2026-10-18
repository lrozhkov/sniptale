import { useEffect, useState } from 'react';
import { BackgroundImagePicker } from '../../../../../composition/background-resources/picker';
import { createSceneGradientBackground } from '../../../../../features/video/project/scene/background-gradient';
import { translate } from '../../../../../platform/i18n';
import { VideoSceneBackgroundKind } from '../../../../../features/video/project/types';
import { SelectInput } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { PANEL_META_CLASS_NAME } from '../shared/panel';
import { SceneBackgroundColorEditor } from './colors';
import type { SceneBackground, SceneBackgroundFieldProps } from './shared';

export function SceneBackgroundFields(props: SceneBackgroundFieldProps) {
  const [imageRequested, setImageRequested] = useState(false);
  useEffect(() => {
    if (props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE) setImageRequested(false);
  }, [props.sceneBackground.kind]);
  return (
    <div className="sniptale-parameter-stack grid gap-3">
      <OptionButtonsField
        label={translate('videoEditor.sidebar.sceneBackgroundTypeLabel')}
        value={imageRequested ? VideoSceneBackgroundKind.IMAGE : props.sceneBackground.kind}
        onChange={(value) => {
          setImageRequested(
            value === VideoSceneBackgroundKind.IMAGE && props.imageAssets.length === 0
          );
          handleSceneBackgroundKindChange(value, props);
        }}
        options={getSceneBackgroundKindOptions(props.imageAssets)}
      />
      {imageRequested || props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE ? (
        <ImageBackgroundEditor {...props} />
      ) : (
        <SceneBackgroundEditor {...props} />
      )}
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
  return (
    <div className="sniptale-parameter-stack grid gap-3">
      {props.imageAssets.length > 0 && (
        <SelectInput
          label={translate('videoEditor.sidebar.sceneBackgroundImageAssetLabel')}
          value={
            props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE
              ? props.sceneBackground.assetId
              : ''
          }
          onChange={(value) => commitSceneBackgroundImage(value, props)}
          options={getSceneBackgroundAssetOptions(props.imageAssets)}
        />
      )}
      {props.onImportImage && (
        <BackgroundImagePicker
          onSelect={({ file, originMediaId }) =>
            props.onImportImage?.(file, {
              destination: 'background',
              ...(originMediaId ? { backgroundOriginMediaId: originMediaId } : {}),
            })
          }
        />
      )}
      {props.imageAssets.length === 0 && (
        <p className={PANEL_META_CLASS_NAME}>
          {translate('videoEditor.sidebar.sceneBackgroundImageEmpty')}
        </p>
      )}
    </div>
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
  return sceneBackground.kind === VideoSceneBackgroundKind.GRADIENT
    ? sceneBackground
    : createSceneGradientBackground();
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
  _imageAssets: SceneBackgroundFieldProps['imageAssets'] = []
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
      disabled: false,
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
