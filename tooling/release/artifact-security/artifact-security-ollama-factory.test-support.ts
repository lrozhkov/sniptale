// Bundled ollama-ai-provider-v2@4.0.1 factory; pinned by the release guard.
export const bundledOllamaFactory = [
  'function UG(e={}){let t=Cw(e.baseURL)??`http://127.0.0.1:11434/api`,n=e.',
  'name??`ollama`,r=()=>({"Ollama-Organization":e.organization,"Ollama-Proj',
  'ect":e.project,...e.headers}),i=(i,a={})=>new Dxe(i,a,{provider:`${n}.co',
  'mpletion`,url:({path:e})=>`${t}${e}`,headers:r,fetch:e.fetch}),a=(i,a={}',
  ')=>new kxe(i,a,{provider:`${n}.embedding`,url:({path:e})=>`${t}${e}`,hea',
  'ders:r,fetch:e.fetch});function o(e){if(new.target)throw Error(`The Olla',
  'ma model function cannot be called with the new keyword.`);return s(e)}l',
  'et s=i=>new zxe(i,{provider:`${n}.responses`,url:({path:e})=>`${t}${e}`,',
  'headers:r,fetch:e.fetch}),c=function(e){if(new.target)throw Error(`The O',
  'llama model function cannot be called with the new keyword.`);return o(e',
  ')};return c.specificationVersion=`v4`,c.languageModel=o,c.chat=o,c.compl',
  'etion=i,c.embedding=a,c.textEmbedding=a,c.textEmbeddingModel=a,c.embeddi',
  'ngModel=a,c.imageModel=e=>{throw new Hx({modelId:e,modelType:`imageModel',
  '`,message:`Image generation is unsupported with Ollama`})},c}',
].join('');
