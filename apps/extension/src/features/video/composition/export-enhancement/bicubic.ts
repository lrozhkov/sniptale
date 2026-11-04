const vertex = `#version 300 es
in vec2 p; out vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D image; uniform vec2 sourceSize; uniform vec4 region; uniform int mode; uniform float strength;
in vec2 uv; out vec4 color;
vec3 fetchAt(vec2 p){return texelFetch(image,ivec2(clamp(p,vec2(0),sourceSize-1.)),0).rgb;}
float cubic(float t){t=abs(t);return t<1.?1.5*t*t*t-2.5*t*t+1.:(t<2.?-.5*t*t*t+2.5*t*t-4.*t+2.:0.);}
float lanczos(float t){
 t=abs(t);
 if(t<.00001)return 1.;
 if(t>=2.)return 0.;
 return sin(3.14159265*t)*sin(1.57079633*t)/(4.9348022*t*t);
}
vec3 interpolate(vec2 p){
 if(mode==0)return texture(image,(p+.5)/sourceSize).rgb;
 vec2 base=floor(p);vec3 acc=vec3(0);float sum=0.;
 for(int j=-1;j<=2;j++)for(int i=-1;i<=2;i++){
  vec2 q=base+vec2(i,j);
  float w=mode==1?cubic(p.x-q.x)*cubic(p.y-q.y):lanczos(p.x-q.x)*lanczos(p.y-q.y);
  acc+=fetchAt(q)*w;
  sum+=w;
 }
 return acc/sum;
}
void main(){
 vec2 p=region.xy+vec2(uv.x,1.-uv.y)*region.zw-.5;
 vec3 c=interpolate(p);
 if(strength>0.){
   // A restrained unsharp mask in source-pixel coordinates, with an amplitude cap.
   vec3 n=interpolate(p+vec2(0,-1)),s=interpolate(p+vec2(0,1));
   vec3 w=interpolate(p+vec2(-1,0)),e=interpolate(p+vec2(1,0));
   vec3 detail=c-(n+s+w+e)*.25;
   c+=clamp(detail*strength,vec3(-.045),vec3(.045));
 }
 color=vec4(clamp(c,0.,1.),1.);
}`;

export interface BicubicBackend {
  readonly gl: Pick<WebGL2RenderingContext, 'isContextLost' | 'finish'>;
  update(source: HTMLCanvasElement): void;
  draw(
    region: [number, number, number, number],
    mode: number,
    strength: number,
    width: number,
    height: number
  ): HTMLCanvasElement | OffscreenCanvas;
  dispose(): void;
}

export function createBicubic(source: HTMLCanvasElement): BicubicBackend {
  const canvas = new OffscreenCanvas(1280, 720);
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  if (!gl) throw new Error('WebGL2 unavailable');
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  const release = () => {
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    const shader = (type: number, text: string) => {
      const result = gl.createShader(type);
      if (!result) throw new Error('Shader allocation failed');
      shaders.push(result);
      gl.shaderSource(result, text);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(result) ?? 'Shader compilation failed');
      return result;
    };
    program = gl.createProgram();
    if (!program) throw new Error('Program allocation failed');
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'Program linking failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Buffer allocation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const attribute = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    if (!texture) throw new Error('Texture allocation failed');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const uniform = (name: string) => gl.getUniformLocation(program!, name);
    const update = (input: HTMLCanvasElement) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
      gl.uniform2f(uniform('sourceSize'), input.width, input.height);
    };
    update(source);
    return {
      gl,
      update,
      draw(region, mode, strength, width, height) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.uniform4fv(uniform('region'), region);
        gl.uniform1i(uniform('mode'), mode);
        gl.uniform1f(uniform('strength'), strength);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return canvas;
      },
      dispose: release,
    };
  } catch (error) {
    release();
    throw error;
  }
}
