const paths=require('./paths.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');const {pathToFileURL}=require('node:url');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await delay(80);}throw Error('Timeout: '+label);}
async function browserSession(root,useHttp=false){
  const executable=paths.browser();
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cosmos-acceptance-'));
  let server,proc,ws,origin='',launchError;
  const pending=new Map(),listeners=new Map();let nextId=0,failures=[],requests=[];
  async function close(){
    if(ws?.readyState===1){try{await send('Browser.close');}catch{}}
    ws?.close();
    if(proc?.pid&&proc.exitCode===null){proc.kill();await Promise.race([new Promise(resolve=>proc.once('exit',resolve)),delay(3000)]);}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    for(let i=0;i<16;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await delay(250);}}
    for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('Session closed'));}pending.clear();
  }
  function send(method,params={}){return new Promise((resolve,reject)=>{
    const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);
    pending.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });}
  try{
    if(typeof WebSocket!=='function')throw Error('Node.js 22+ required');
    if(useHttp){
      const allowed=new Set([...paths.pages,...paths.runtimeFiles,
        ...require(paths.data('asset-manifest.json')).assets.map(a=>a.localPath),
        ...fs.readdirSync(paths.chapters('')).map(f=>'app/chapters/'+f)]);
      server=http.createServer((req,res)=>{let filename;try{filename=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '');}catch{res.writeHead(400);res.end();return;}
        if(!allowed.has(filename)){res.writeHead(404);res.end();return;}
        const extension=path.extname(filename),types={'.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
        res.setHeader('Content-Type',types[extension]||'text/html; charset=utf-8');fs.createReadStream(path.join(root,filename)).pipe(res);
      });
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/`;
    }
    proc=spawn(executable,['--headless=new','--no-first-run','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    proc.on('error',error=>{launchError=error;});
    const port=await until(()=>{if(launchError)throw launchError;if(proc.exitCode!==null)throw Error('Browser exited '+proc.exitCode);try{return fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{return false;}},'browser start',Number(process.env.TEST_TIMEOUT_MS||20000));
    const targets=await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(5000)})).json();const target=targets.find(t=>t.type==='page');if(!target)throw Error('No page target');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket open timeout')),10000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(Error('WebSocket open failed'));};});
    ws.onmessage=event=>{const msg=JSON.parse(event.data);
      if(listeners.has(msg.method))for(const listener of listeners.get(msg.method))listener(msg.params);
      if(msg.method==='Runtime.exceptionThrown')failures.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
      if(msg.method==='Network.requestWillBeSent')requests.push(msg.params.request.url);
      if(pending.has(msg.id)){const p=pending.get(msg.id);clearTimeout(p.timer);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}
    };
    ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Debugger disconnected'));}pending.clear();};
    await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
    const version=await send('Browser.getVersion');
    async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
    function url(name){return origin?new URL(name,origin).href:pathToFileURL(path.join(root,name)).href;}
    let navigations=0;
    async function load(name,query='?seed=20261106'){
      const token=String(Date.now())+'-'+Math.random();await evaluate(`window.__testNavigationToken=${JSON.stringify(token)}`);
      navigations++;const navigation=await send('Page.navigate',{url:url(name)+query});if(navigation.errorText)throw Error('Navigation failed: '+navigation.errorText);
      await until(async()=>{try{const state=await evaluate(`(() => {if(window.__testNavigationToken===${JSON.stringify(token)}||document.readyState!=='complete'||!decodeURIComponent(location.pathname).endsWith(${JSON.stringify('/'+name)}))return null;return window.Cosmos?.info()||null;})()`);if(state?.status==='error')throw Error('Renderer error: '+state.errors.join('; '));return state?.status==='ready'&&await evaluate(`!!document.getElementById('quality')`);}catch(error){if(error.message.startsWith('Renderer error:'))throw error;return false;}},'load '+name);
    }
    async function viewport(width,height,dpr=1){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:width<500});}
    async function key(key,extra={}){await send('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});await send('Input.dispatchKeyEvent',{type:'keyUp',key,...extra});}
    function on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);return()=>listeners.get(method).delete(listener);}
    return {send,evaluate,load,viewport,key,url,close,version,executable,on,get navigations(){return navigations;},get failures(){return [...failures];},get externalRequests(){return requests.filter(u=>/^https?:/.test(u)&&!(origin&&u.startsWith(origin)));}};
  }catch(error){await close();throw error;}
}
module.exports={browserSession,until,delay};
