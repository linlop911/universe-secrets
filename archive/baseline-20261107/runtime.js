/* Shared native runtime. Classic script deliberately supports file:// without a build step. */
(() => {
  'use strict';
  const levels = {
    low: { pixels: 600000, scale: 0.6, particles: 0.35, steps: 56 },
    medium: { pixels: 1200000, scale: 0.8, particles: 0.65, steps: 96 },
    high: { pixels: 2100000, scale: 1, particles: 1, steps: 140 }
  };
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Preferences remain usable without storage. */ } };
  const percentile = (values, fraction) => { const v = [...values].sort((a,b) => a-b); return v.length ? v[Math.min(v.length-1, Math.floor(v.length*fraction))] : 0; };
  let mode = read('cosmos-quality', 'auto');
  if (!(mode in levels) && mode !== 'auto') mode = 'auto';
  let effective = mode === 'auto' ? 'high' : mode;
  let reduced = read('cosmos-reduced', matchMedia('(prefers-reduced-motion: reduce)').matches ? '1' : '0') === '1';
  let volume = Math.min(1, Math.max(0, Number(read('cosmos-volume', '0.5')) || 0));
  let factory, scope, scene, initialState, raf = null, elapsed = 0, lastWall = null, lastDraw = -Infinity;
  let paused = false, lost = false, disposed = false, status = 'loading', generation = 0;
  let recoveryState, testFrame = false;
  let deltaSeconds = 1/60;
  const costs = [], intervals = [];
  let autoSince = null, lastQualityChange = -Infinity, stableSince = null;
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') || 20261106) >>> 0;
  const events = new EventTarget();
  const diagnostics = [];
  function report(error) {
    status = 'error'; pause();
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(message);
    scope?.dispose();
    let box = document.getElementById('render-error');
    if (!box) { box = document.createElement('div'); box.id = 'render-error'; box.setAttribute('role','alert'); document.body.append(box); }
    box.textContent = '渲染失败：' + message;
    events.dispatchEvent(new Event('status'));
  }
  function randomGenerator(initial) {
    let value = initial;
    return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function createScope() {
    const abort = new AbortController(), timers = new Set(), contexts = new Map(), suspendedByRuntime = new Set(), programs = new Set(), resources = [];
    let gl, frameCount = 0, uniforms = {}, audioNodes = new Set(), protectedNodes = new Set();
    const random = randomGenerator(seed);
    function on(target, type, listener, options = {}) { target.addEventListener(type, listener, { ...(typeof options === 'boolean' ? { capture: options } : options), signal: abort.signal }); }
    function timeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (!abort.signal.aborted) fn(); }, ms); timers.add(id); return id; }
    function trackNode(node, ctx, source = false) {
      audioNodes.add(node);
      const edges = new Set(), connect = node.connect.bind(node), disconnect = node.disconnect.bind(node);
      node.connect = (target, ...args) => { edges.add(target); return connect(target, ...args); };
      node.disconnect = (...args) => { try { disconnect(...args); } catch { /* Already disconnected */ } if (!args.length) { edges.clear(); audioNodes.delete(node); } };
      node.__cosmosEdges = edges;
      if (source) node.addEventListener('ended', () => {
        const visit = (n, seen = new Set()) => {
          if (seen.has(n) || protectedNodes.has(n) || !audioNodes.has(n)) return;
          seen.add(n); const children = [...(n.__cosmosEdges || [])]; n.disconnect();
          children.forEach(child => visit(child, seen));
        };
        visit(node);
      }, { once: true });
      return node;
    }
    function audio() {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const nativeGain = ctx.createGain.bind(ctx), nativeCompressor = ctx.createDynamicsCompressor.bind(ctx);
      const output = nativeGain(), limiter = nativeCompressor(), meter = ctx.createAnalyser();
      for(const shared of [output,limiter,meter])protectedNodes.add(shared);
      output.gain.value = volume;
      limiter.threshold.value = -6; limiter.ratio.value = 16;
      meter.fftSize=2048;
      output.connect(limiter); limiter.connect(meter); meter.connect(ctx.destination);
      contexts.set(ctx, { output, limiter, meter });
      for (const name of ['createOscillator','createGain','createAnalyser','createBiquadFilter','createStereoPanner']) {
        if (!ctx[name]) continue;
        const create = ctx[name].bind(ctx);
        ctx[name] = (...args) => trackNode(create(...args), ctx, name === 'createOscillator');
      }
      return ctx;
    }
    function context(canvas) {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false });
      if (!gl) throw new Error('WebGL unavailable');
      gl.disable(gl.DITHER);
      return gl;
    }
    function shader(glContext, type, source) {
      const shader = glContext.createShader(type); if (!shader) throw new Error('Shader allocation failed');
      resources.push(['Shader', shader]); glContext.shaderSource(shader, source); glContext.compileShader(shader);
      if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) throw new Error('Shader compile: ' + glContext.getShaderInfoLog(shader));
      return shader;
    }
    function program(glContext, ...shaders) {
      const program = glContext.createProgram(); if (!program) throw new Error('WebGL program allocation failed');
      resources.push(['Program', program]); shaders.forEach(shader => glContext.attachShader(program, shader)); glContext.linkProgram(program);
      if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) throw new Error('WebGL program link: ' + glContext.getProgramInfoLog(program));
      programs.add(program); return program;
    }
    function resize(canvas) {
      const q = levels[effective], dpr = Math.min(devicePixelRatio || 1, 2);
      let w = Math.max(1, Math.floor(innerWidth*dpr*q.scale)), h = Math.max(1, Math.floor(innerHeight*dpr*q.scale));
      const factor = Math.min(1, Math.sqrt(q.pixels/(w*h))); w = Math.max(1,Math.floor(w*factor)); h = Math.max(1,Math.floor(h*factor));
      if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); }
      const active=gl.getParameter(gl.CURRENT_PROGRAM);
      for(const p of programs){const loc=gl.getUniformLocation(p,'u_point_scale');if(loc!==null){gl.useProgram(p);gl.uniform1f(loc,h/720);}}
      gl.useProgram(active);
    }
    function camera(canvas, get, set, limits) {
      const pointers = new Map(); let distance=0;
      canvas.style.touchAction='none'; canvas.tabIndex=0;
      canvas.setAttribute('aria-label','三维场景。方向键旋转，加减键缩放。');
      function manual() { const state=get(); if(state.isTraversing)return false; set({directorMode:false}); document.getElementById('btn-director')?.classList.remove('active'); return true; }
      on(canvas,'pointerdown',event=>{if(event.button!==0||!manual())return;pointers.set(event.pointerId,[event.clientX,event.clientY]);canvas.setPointerCapture(event.pointerId);set({isDragging:true});event.preventDefault();});
      on(canvas,'pointermove',event=>{
        const previous=pointers.get(event.pointerId);if(!previous)return;
        pointers.set(event.pointerId,[event.clientX,event.clientY]);const state=get();
        if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance>0)set({camRadius:Math.max(limits[0],Math.min(limits[1],state.camRadius*distance/d))});distance=d;}
        else set({camPhi:state.camPhi+(event.clientX-previous[0])*0.005,camTheta:Math.max(-1.42,Math.min(1.42,state.camTheta+(event.clientY-previous[1])*0.005))});
      });
      const stop=event=>{pointers.delete(event.pointerId);distance=0;if(!pointers.size)set({isDragging:false});};
      on(canvas,'pointerup',stop);on(canvas,'pointercancel',stop);on(canvas,'lostpointercapture',stop);
      on(canvas,'wheel',event=>{if(!manual())return;event.preventDefault();const s=get();set({camRadius:Math.max(limits[0],Math.min(limits[1],s.camRadius+event.deltaY*0.012))});},{passive:false});
      on(canvas,'keydown',event=>{const s=get();let patch;if(event.key==='ArrowLeft')patch={camPhi:s.camPhi-.1};if(event.key==='ArrowRight')patch={camPhi:s.camPhi+.1};if(event.key==='ArrowUp')patch={camTheta:Math.max(-1.42,s.camTheta-.1)};if(event.key==='ArrowDown')patch={camTheta:Math.min(1.42,s.camTheta+.1)};if(event.key==='+'||event.key==='=')patch={camRadius:Math.max(limits[0],s.camRadius*.9)};if(event.key==='-')patch={camRadius:Math.min(limits[1],s.camRadius*1.1)};if(patch&&manual()){set(patch);event.preventDefault();}});
    }
    return {
      on, timeout, random, context, shader, program, resize, audio, camera,
      clearTimeout(id) { clearTimeout(id);timers.delete(id); },
      buffer() { const buffer=gl.createBuffer();resources.push(['Buffer',buffer]);return buffer; },
      keepAudio(node) { protectedNodes.add(node); },
      destination(ctx) { return contexts.get(ctx)?.output || ctx.destination; },
      particles(total) { return Math.max(186,Math.floor(total*levels[effective].particles)); },
      prepare() {
        for (const p of programs) { gl.useProgram(p); const loc = gl.getUniformLocation(p,'u_quality_steps'); if (loc !== null) gl.uniform1i(loc, levels[effective].steps); }
      },
      recordFrame() { frameCount++; },
      info() {
        const available = gl && !gl.isContextLost();
        const debug = available && gl.getExtension('WEBGL_debug_renderer_info');
        return { frameCount, programCount: programs.size, resourceCount:resources.length, timerCount:timers.size, audioContexts: contexts.size, audioNodes: audioNodes.size, audioStates:[...contexts.keys()].map(ctx=>ctx.state),
          renderer: available ? gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null,
          linked: !!available && [...programs].every(p=>gl.getProgramParameter(p,gl.LINK_STATUS)), contextLost: !!gl?.isContextLost() };
      },
      sample(includePixels=false) {
        const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight, pixels=new Uint8Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const error=gl.getError(); let hash=2166136261,lit=0,max=0,total=0;
        for (let gy=0;gy<24;gy++) for(let gx=0;gx<40;gx++) {
          const x=Math.floor((w-1)*gx/39),y=Math.floor((h-1)*gy/23),i=(y*w+x)*4;
          const brightness=pixels[i]+pixels[i+1]+pixels[i+2]; max=Math.max(max,brightness); total+=brightness; if(brightness>15)lit++;
        }
        let saturated=0;
        for(let i=0;i<pixels.length;i+=4){if(pixels[i]>250&&pixels[i+1]>250&&pixels[i+2]>250)saturated++;for(let k=0;k<3;k++)hash=Math.imul(hash^pixels[i+k],16777619)>>>0;}
        let pixelData;
        if(includePixels){let binary='';for(const byte of pixels)binary+=String.fromCharCode(byte);pixelData=btoa(binary);}
        return { width:w,height:h,hash:hash.toString(16),coverage:lit/960,saturatedFraction:saturated/(w*h),maxBrightness:max,meanBrightness:total/960,glError:error,pixelData };
      },
      sync() { const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);const error=gl.getError();if(error)throw new Error('Benchmark GL error: '+error); },
      audioSample() {
        let peak=0,sum=0,count=0;
        for(const {meter}of contexts.values()){const data=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(data);for(const value of data){peak=Math.max(peak,Math.abs(value));sum+=value*value;count++;}}
        return {peak,rms:count?Math.sqrt(sum/count):0};
      },
      async recordAudio(ms) {
        const [ctx,data]=[...contexts.entries()][0]||[];if(!ctx)throw new Error('Audio has not started');
        const target=ctx.createMediaStreamDestination(),recorder=new MediaRecorder(target.stream);data.limiter.connect(target);
        const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        const done=new Promise((resolve,reject)=>{recorder.onerror=reject;recorder.onstop=async()=>{try{const buffer=await new Blob(chunks).arrayBuffer();let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);resolve({mime:recorder.mimeType,base64:btoa(binary)});}catch(error){reject(error);}};});
        recorder.start();await new Promise(resolve=>setTimeout(resolve,ms));recorder.stop();data.limiter.disconnect(target);target.stream.getTracks().forEach(t=>t.stop());return done;
      },
      suspend() { for(const ctx of contexts.keys()) if(ctx.state==='running'){suspendedByRuntime.add(ctx);ctx.suspend().catch(()=>{});} },
      resumeAudio() { for(const ctx of contexts.keys())if(ctx.state==='suspended'&&(scene?.audioEnabled()||suspendedByRuntime.has(ctx)))ctx.resume().catch(()=>{});suspendedByRuntime.clear(); },
      volume(value) { for(const [ctx,{output}] of contexts) output.gain.setTargetAtTime(value,ctx.currentTime,0.03); },
      dispose() {
        abort.abort(); for(const id of timers)clearTimeout(id); timers.clear();
        for(const ctx of contexts.keys())ctx.close().catch(()=>{}); contexts.clear(); suspendedByRuntime.clear();audioNodes.clear();
        if(gl&&!gl.isContextLost())for(const [type,resource] of resources)gl['delete'+type](resource);
        resources.length=0; programs.clear();
      }
    };
  }
  function settingsEvent() { events.dispatchEvent(new Event('settings')); }
  function setQuality(value) {
    if(!(value in levels)&&value!=='auto')throw new Error('Unknown quality');
    mode=value; effective=value==='auto'?'high':value; autoSince=null;stableSince=null;lastQualityChange=elapsed;
    save('cosmos-quality',value); settingsEvent();
  }
  function observeQuality(cost,now) {
    if(mode!=='auto'||testFrame)return;
    if(cost>28) { stableSince=null; if(autoSince===null)autoSince=now;
      if(now-autoSince>1800&&now-lastQualityChange>3500) {
        effective=effective==='high'?'medium':'low';lastQualityChange=now;autoSince=null;settingsEvent();
      }
    } else { autoSince=null;
      if(cost<20) { if(stableSince===null)stableSince=now;
        if(now-stableSince>12000&&now-lastQualityChange>12000&&effective!=='high'){effective=effective==='low'?'medium':'high';lastQualityChange=now;stableSince=null;settingsEvent();}
      } else stableSince=null;
    }
  }
  function draw(time) {
    scope.prepare(); scene.draw(reduced ? 0 : time); scene.audioDraw(); scope.recordFrame();
  }
  function schedule() { if(raf===null&&!paused&&!lost&&!disposed&&status==='ready'&&!document.hidden)raf=requestAnimationFrame(tick); }
  function tick(now) {
    raf=null;
    if(paused||lost||disposed||document.hidden)return;
    const delta=lastWall===null?0:Math.min(100,Math.max(0,now-lastWall)); lastWall=now;elapsed+=delta;
    if(reduced&&elapsed-lastDraw<1000/12){schedule();return;}
    const before=performance.now();
    deltaSeconds=lastDraw<0?0:Math.min(.1,(elapsed-lastDraw)/1000);
    try{draw(elapsed);}catch(error){report(error);return;}
    const cost=performance.now()-before;
    costs.push(cost);if(costs.length>180)costs.shift();
    if(lastDraw>=0){intervals.push(elapsed-lastDraw);if(intervals.length>180)intervals.shift();}lastDraw=elapsed;
    observeQuality(Math.max(cost,delta),elapsed);schedule();
  }
  function pause() { paused=true;if(raf!==null)cancelAnimationFrame(raf);raf=null;lastWall=null;scope?.suspend(); }
  function resume() { if(disposed||lost||status!=='ready')return;paused=false;lastWall=null;scope?.resumeAudio();schedule(); }
  function controlsState() {
    return { values:Object.fromEntries([...document.querySelectorAll('input[type=range][id]')].map(el=>[el.id,el.value])),
      buttons:[...document.querySelectorAll('button[data-mode],button[data-step],button[id].active')].filter(el=>el.id!=='btn-audio').map(el=>({selector:el.id?'#'+el.id:'button[data-'+(el.hasAttribute('data-mode')?'mode':'step')+'="'+(el.dataset.mode??el.dataset.step)+'"]',active:el.classList.contains('active')})) };
  }
  function boot(saved) {
    scope?.dispose(); scope=createScope();
    try {
      scene=factory(scope);
      for(const input of document.querySelectorAll('input[id^="param-"]'))input.dispatchEvent(new Event('input',{bubbles:true}));
      initialState=scene.getState();generation++;status='ready';disposed=false;
      if(saved) {
        for(const [id,value]of Object.entries(saved.controls.values)){const el=document.getElementById(id);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}
        scene.setState({...saved.state,audioActive:false});elapsed=saved.elapsed;
        if(saved.state.audioActive)document.getElementById('btn-audio')?.click();
      }
      document.getElementById('render-error')?.remove();lastWall=null;lastDraw=-Infinity;if(saved?.paused)pause();else resume();
    }catch(error){report(error);}
    events.dispatchEvent(new Event('status'));
  }
  window.Cosmos = {
    events, levels, mount(fn) {factory=fn;boot();}, pause, resume,
    setQuality, get settings(){return {mode,effective,reduced,volume};},
    setReduced(value){reduced=!!value;save('cosmos-reduced',reduced?'1':'0');settingsEvent();},
    setVolume(value){volume=Math.min(1,Math.max(0,Number(value)||0));save('cosmos-volume',String(volume));scope?.volume(volume);settingsEvent();},
    get state(){return scene?.getState();},
    get delta(){return testFrame ? 0 : deltaSeconds;},
    audioInfo(){return scene?.audioInfo();},
    audioSample(){return scope.audioSample();},
    recordAudio(ms=500){return scope.recordAudio(Math.max(100,Math.min(5000,ms)));},
    info(){return {status,generation,seed,elapsed,paused,rafPending:raf!==null,...scope?.info(),settings:this.settings,errors:[...diagnostics],frameCost:{p50:percentile(costs,.5),p95:percentile(costs,.95),samples:costs.length},frameInterval:{p50:percentile(intervals,.5),p95:percentile(intervals,.95),samples:intervals.length}};},
    capture(seconds=2, controls={}, statePatch={}, includePixels=false) {
      if(status!=='ready'||lost)throw new Error('Renderer not ready');
      pause();testFrame=true;
      const state=scene.getState(), saved=controlsState();
      try{
        scene.setState({camPhi:initialState.camPhi,camTheta:initialState.camTheta,camRadius:initialState.camRadius,...statePatch});
        for(const [id,value]of Object.entries(controls)){const el=document.getElementById(id);if(!el)throw new Error('Unknown control: '+id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}
        scene.setState({autoplay:false,directorMode:false,isDragging:true});
        const baseline=scene.getState();draw(seconds*1000);const sample=scope.sample(includePixels);scene.setState(baseline);
        return {...sample,state:scene.getState(),telemetry:[...document.querySelectorAll('[id^="disp-"]')].map(el=>el.textContent)};
      }finally{
        for(const [id,value]of Object.entries(saved.values)){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}
        scene.setState(state);testFrame=false;
      }
    },
    async benchmark(frames=24) {
      pause();testFrame=true;const state=scene.getState(),saved=controlsState(),times=[];
      try{
        for(const input of document.querySelectorAll('input[id^="param-"]')){input.value=input.defaultValue;input.dispatchEvent(new Event('input',{bubbles:true}));}
        scene.setState({camRadius:initialState.camRadius,camTheta:initialState.camTheta,camPhi:initialState.camPhi,autoplay:false,directorMode:false,isDragging:true,currentMode:0,spectralMode:0,rebirthFlash:0});
        for(let i=0;i<frames;i++){await new Promise(requestAnimationFrame);const start=performance.now();draw(2000+i*16.667);scope.sync();times.push(performance.now()-start);}
        return {method:'default controls/camera; draw + synchronous 1-pixel readback completion barrier; wall time, not GPU timer',model:scene.getState(),frames,p50:percentile(times,.5),p95:percentile(times,.95),max:Math.max(...times),longFrames:times.filter(t=>t>50).length,...scope.info()};
      }finally{
        for(const [id,value]of Object.entries(saved.values)){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
        scene.setState(state);testFrame=false;
      }
    },
    // Pure governor input used by acceptance tests; rendering still uses measured costs in normal operation.
    observeQuality,
    dispose(){pause();disposed=true;scope?.dispose();status='disposed';}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden){scope?.suspend();if(raf!==null)cancelAnimationFrame(raf);raf=null;lastWall=null;}else if(!paused)resume();});
  window.addEventListener('pagehide',()=>Cosmos.dispose());
  document.addEventListener('DOMContentLoaded',()=>{
    const canvas=document.getElementById('glcanvas');
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();if(status!=='ready')return;
      recoveryState={controls:controlsState(),state:scene.getState(),elapsed,paused};lost=true;pause();scope.dispose();status='lost';events.dispatchEvent(new Event('status'));
    });
    canvas.addEventListener('webglcontextrestored',()=>{if(!lost)return;lost=false;boot(recoveryState);recoveryState=null;});
  });
})();
