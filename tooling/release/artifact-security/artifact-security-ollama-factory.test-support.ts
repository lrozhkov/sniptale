// Bundled ollama-ai-provider-v2@4.0.1 factory; pinned by the release guard.
export const bundledOllamaFactory = [
  'function LG(e={}){let t=Sw(e.baseURL)??`http://127.0.0.1:11434/api`,',
  'n=e.name??`ollama`,r=()=>({"Ollama-Organization":e.organization,"Oll',
  'ama-Project":e.project,...e.headers}),i=(i,a={})=>new PSe(i,a,{provi',
  'der:`${n}.completion`,url:({path:e})=>`${t}${e}`,headers:r,fetch:e.f',
  'etch}),a=(i,a={})=>new ISe(i,a,{provider:`${n}.embedding`,url:({path',
  ':e})=>`${t}${e}`,headers:r,fetch:e.fetch});function o(e){if(new.targ',
  'et)throw Error(`The Ollama model function cannot be called with the ',
  'new keyword.`);return s(e)}let s=i=>new KSe(i,{provider:`${n}.respon',
  'ses`,url:({path:e})=>`${t}${e}`,headers:r,fetch:e.fetch}),c=function',
  '(e){if(new.target)throw Error(`The Ollama model function cannot be c',
  'alled with the new keyword.`);return o(e)};return c.specificationVer',
  'sion=`v4`,c.languageModel=o,c.chat=o,c.completion=i,c.embedding=a,c.',
  'textEmbedding=a,c.textEmbeddingModel=a,c.embeddingModel=a,c.imageMod',
  'el=e=>{throw new Vx({modelId:e,modelType:`imageModel`,message:`Image',
  ' generation is unsupported with Ollama`})},c}',
].join('');
