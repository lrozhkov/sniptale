/** Adapted from Pixi Filters v6.1.5. Copyright (c) 2013-2025 Mathew Groves, Chad Engler.
 * MIT license and pinned source identities: vendor/pixi-filters/.
 */
export const SOURCE_IMAGE_FILTER_SHADER = `
struct Params { extent: vec4f, p0: vec4f, p1: vec4f, mode: vec4u };
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var pixels: texture_2d<f32>;
@group(0) @binding(2) var original: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@vertex fn vertex(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
  let positions=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(positions[index],0,1);
}
// The compositor source is premultiplied RGBA8. Reconstruct its canonical straight
// bytes before float filtering, as Canvas getImageData does, then interpolate.
fn canonicalSource(value:vec4f)->vec4f {
  if(value.a<=0){return vec4f(0);}
  return vec4f(round(clamp(value.rgb/value.a,vec3f(0),vec3f(1))*255)/255*value.a,value.a);
}
fn tap(uv:vec2f)->vec4f {
  if(u.mode.y==1u){
    let point=clamp(uv*u.extent.xy-vec2f(.5),vec2f(0),u.extent.xy-vec2f(1));
    let first=vec2i(floor(point));
    let last=min(first+vec2i(1),vec2i(u.extent.xy)-vec2i(1));
    let phase=fract(point);
    return mix(
      mix(canonicalSource(textureLoad(pixels,first,0)),
        canonicalSource(textureLoad(pixels,vec2i(last.x,first.y),0)),phase.x),
      mix(canonicalSource(textureLoad(pixels,vec2i(first.x,last.y),0)),
        canonicalSource(textureLoad(pixels,last,0)),phase.x),phase.y);
  }
  let halfTexel=vec2f(.5)/u.extent.xy;
  return textureSampleLevel(pixels,linearSampler,clamp(uv,halfTexel,vec2f(1)-halfTexel),0);
}
@fragment fn fragment(@builtin(position) position:vec4f)->@location(0) vec4f {
  let uv=position.xy/u.extent.xy;
  let color=tap(uv);
  var base=textureSampleLevel(original,linearSampler,uv,0);
  if(u.mode.z==1u){base=canonicalSource(base);}
  if(u.mode.x==0u) {
    var rgb=vec3f(0);
    if(color.a>0) {rgb=color.rgb/color.a;}
    let luma=dot(rgb,vec3f(.2125,.7154,.0721));
    rgb=mix(vec3f(.5),mix(vec3f(luma),rgb,u.p0.z),u.p0.y)*u.p1.xyz*u.p0.x;
    return mix(color,vec4f(clamp(rgb,vec3f(0),vec3f(1))*color.a,color.a),u.p0.w);
  }
  if(u.mode.x==1u) {
    let d=vec2f(u.p0.x)/u.extent.zw;
    return (tap(uv+vec2f(-d.x,-d.y))+tap(uv+vec2f(d.x,-d.y))+tap(uv+vec2f(-d.x,d.y))+tap(uv+d))*.25;
  }
  if(u.mode.x==2u) {
    let brightness=(max(max(color.r,color.g),color.b)+min(min(color.r,color.g),color.b))*.5;
    return select(vec4f(0),color,brightness>u.p0.x);
  }
  if(u.mode.x==3u) {
    let rgb=clamp(base.rgb+color.rgb*u.p0.x,vec3f(0),vec3f(1));
    let alpha=max(base.a,max(max(rgb.r,rgb.g),rgb.b));
    return mix(base,vec4f(rgb,alpha),u.p0.y);
  }
  if(u.mode.x==5u || u.mode.x==6u) {
    var rgb=vec3f(dot(color.rgb,vec3f(.2126,.7152,.0722)));
    if(u.mode.x==6u){rgb=vec3f(
      dot(color.rgb,vec3f(.393,.769,.189)),dot(color.rgb,vec3f(.349,.686,.168)),
      dot(color.rgb,vec3f(.272,.534,.131)));}
    return mix(color,vec4f(clamp(rgb,vec3f(0),vec3f(color.a)),color.a),u.p0.x);
  }
  if(u.mode.x==7u) {
    let d=vec2f(1)/u.extent.zw;
    let rgb=color.rgb*(1+4*u.p0.x)-u.p0.x*(
      tap(uv+vec2f(d.x,0)).rgb+tap(uv-vec2f(d.x,0)).rgb+
      tap(uv+vec2f(0,d.y)).rgb+tap(uv-vec2f(0,d.y)).rgb);
    return mix(color,vec4f(clamp(rgb,vec3f(0),vec3f(color.a)),color.a),u.p0.y);
  }
  if(u.mode.x==8u) {
    let center=(floor(uv*u.extent.zw/u.p0.x)+vec2f(.5))*u.p0.x/u.extent.zw;
    return mix(color,tap(center),u.p0.y);
  }
  if(u.mode.x==9u) {
    let distance=length((uv-vec2f(.5))*u.extent.zw)*2/min(u.extent.z,u.extent.w);
    let edge=clamp((distance-u.p0.y)/max(u.p0.z,.000001),0,1);
    return vec4f(color.rgb*(1-u.p0.x*edge*edge*(3-2*edge)*u.p0.w),color.a);
  }
  if(u.mode.x==10u) {
    let point=vec2u(floor(position.xy*u.extent.zw/u.extent.xy));
    let seed=u32(u.p0.y)|(u32(u.p0.z)<<16u);
    let tick=u32(u.p0.w)|(u32(u.p1.x)<<16u);
    var hash=point.x^(point.y*0x9e3779b9u)^seed^(tick*0x85ebca6bu);
    hash=(hash^(hash>>16u))*0x7feb352du;hash=(hash^(hash>>15u))*0x846ca68bu;hash=hash^(hash>>16u);
    let noise=(f32(hash&65535u)/65535-.5)*u.p0.x;
    var rgb=vec3f(0);if(color.a>0){rgb=color.rgb/color.a;}
    return mix(color,vec4f(clamp(rgb+vec3f(noise),vec3f(0),vec3f(1))*color.a,color.a),u.p1.y);
  }
  return mix(base,color,u.p0.x);
}`;
