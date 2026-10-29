// Bundled ollama-ai-provider-v2@4.0.1 factory; pinned by the release guard.
export const bundledOllamaFactory = [
  'function YG(e={}){let t=xw(e.baseURL)??`http://127.0.0.1:11434/api`,n=e.name',
  '??`ollama`,r=()=>({"Ollama-Organization":e.organization,"Ollama-Project":e.p',
  'roject,...e.headers}),i=(i,a={})=>new Qbe(i,a,{provider:`${n}.completion`,ur',
  'l:({path:e})=>`${t}${e}`,headers:r,fetch:e.fetch}),a=(i,a={})=>new exe(i,a,{',
  'provider:`${n}.embedding`,url:({path:e})=>`${t}${e}`,headers:r,fetch:e.fetch',
  '});function o(e){if(new.target)throw Error(`The Ollama model function cannot',
  ' be called with the new keyword.`);return s(e)}let s=i=>new uxe(i,{provider:',
  '`${n}.responses`,url:({path:e})=>`${t}${e}`,headers:r,fetch:e.fetch}),c=func',
  'tion(e){if(new.target)throw Error(`The Ollama model function cannot be calle',
  'd with the new keyword.`);return o(e)};return c.specificationVersion=`v4`,c.',
  'languageModel=o,c.chat=o,c.completion=i,c.embedding=a,c.textEmbedding=a,c.te',
  'xtEmbeddingModel=a,c.embeddingModel=a,c.imageModel=e=>{throw new Bx({modelId',
  ':e,modelType:`imageModel`,message:`Image generation is unsupported with Olla',
  'ma`})},c}',
].join('');
