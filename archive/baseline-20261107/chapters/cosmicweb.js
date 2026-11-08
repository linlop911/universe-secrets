/* cosmicweb scene: visual model, controls and chapter-specific sound. */
Cosmos.mount(function(runtime) {

    const canvas = document.getElementById('glcanvas');
    const gl = runtime.context(canvas);

    const createShader = runtime.shader;

    // Pass 1: Background
    const vsBg = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs-bg').text);
    const fsBg = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs-bg').text);
    const progBg = runtime.program(gl, vsBg, fsBg);

    const quadBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);

    const bgPosLoc = gl.getAttribLocation(progBg, 'position');
    const bgResLoc = gl.getUniformLocation(progBg, 'u_resolution');
    const bgTimeLoc = gl.getUniformLocation(progBg, 'u_time');
    const bgModeLoc = gl.getUniformLocation(progBg, 'u_mode');
    const bgScanLoc = gl.getUniformLocation(progBg, 'u_scan_pos');
    const bgShowScanLoc = gl.getUniformLocation(progBg, 'u_show_scan');

    // Pass 2: Cosmic Web Particles
    const vsWeb = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs-web').text);
    const fsWeb = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs-web').text);
    const progWeb = runtime.program(gl, vsWeb, fsWeb);

    const PARTICLE_COUNT = 120000;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const dirs = new Float32Array(PARTICLE_COUNT * 3);
    const types = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);

    // Generate Hierarchical Cosmic Web with 186 Supercluster Nodes
    const NODE_COUNT = 186;
    const nodeCoords = [];
    for (let n = 0; n < NODE_COUNT; n++) {
      nodeCoords.push([
        (runtime.random() - 0.5) * 36.0,
        (runtime.random() - 0.5) * 22.0,
        (runtime.random() - 0.5) * 24.0,
      ]);
    }

    let pIdx = 0;
    // Nodes
    for (let n = 0; n < NODE_COUNT && pIdx < PARTICLE_COUNT; n++) {
      positions[pIdx * 3 + 0] = nodeCoords[n][0];
      positions[pIdx * 3 + 1] = nodeCoords[n][1];
      positions[pIdx * 3 + 2] = nodeCoords[n][2];
      dirs[pIdx * 3 + 0] = 0; dirs[pIdx * 3 + 1] = 0; dirs[pIdx * 3 + 2] = 0;
      types[pIdx] = 1.0; // Node
      speeds[pIdx] = 1.0;
      pIdx++;
    }

    // Filaments connecting nearest nodes
    for (let i = 0; i < NODE_COUNT; i++) {
      const n1 = nodeCoords[i];
      // connect to 3 nearest
      for (let k = 1; k <= 3; k++) {
        const n2 = nodeCoords[(i + k * 17) % NODE_COUNT];
        const segCount = 180;
        for (let s = 0; s < segCount && pIdx < PARTICLE_COUNT; s++) {
          const frac = s / segCount;
          const jitter = (runtime.random() - 0.5) * 0.75;
          positions[pIdx * 3 + 0] = n1[0] + (n2[0] - n1[0]) * frac + jitter;
          positions[pIdx * 3 + 1] = n1[1] + (n2[1] - n1[1]) * frac + jitter;
          positions[pIdx * 3 + 2] = n1[2] + (n2[2] - n1[2]) * frac + jitter;

          const dx = n2[0] - n1[0], dy = n2[1] - n1[1], dz = n2[2] - n1[2];
          const len = Math.hypot(dx, dy, dz) || 1;
          dirs[pIdx * 3 + 0] = dx / len;
          dirs[pIdx * 3 + 1] = dy / len;
          dirs[pIdx * 3 + 2] = dz / len;

          types[pIdx] = runtime.random() < 0.15 ? 2.0 : 0.0;
          speeds[pIdx] = 0.5 + runtime.random() * 0.8;
          pIdx++;
        }
      }
    }

    // Fill remaining with Bullet Cluster and background gas
    while (pIdx < PARTICLE_COUNT) {
      const isBullet = runtime.random() < 0.35;
      if (isBullet) {
        positions[pIdx * 3 + 0] = (runtime.random() - 0.5) * 14.0;
        positions[pIdx * 3 + 1] = (runtime.random() - 0.5) * 7.0;
        positions[pIdx * 3 + 2] = (runtime.random() - 0.5) * 8.0;
        types[pIdx] = 3.0; // Bullet gas
      } else {
        positions[pIdx * 3 + 0] = (runtime.random() - 0.5) * 44.0;
        positions[pIdx * 3 + 1] = (runtime.random() - 0.5) * 28.0;
        positions[pIdx * 3 + 2] = (runtime.random() - 0.5) * 32.0;
        types[pIdx] = 0.0;
      }
      dirs[pIdx * 3 + 0] = (runtime.random() - 0.5);
      dirs[pIdx * 3 + 1] = (runtime.random() - 0.5);
      dirs[pIdx * 3 + 2] = (runtime.random() - 0.5);
      speeds[pIdx] = 0.5 + runtime.random() * 0.5;
      pIdx++;
    }

    // Preserve all nodes; mix remaining types so each quality prefix retains gas and filaments.
    for(let i=PARTICLE_COUNT-1;i>NODE_COUNT;i--){
      const j=NODE_COUNT+Math.floor(runtime.random()*(i-NODE_COUNT+1));
      for(const data of [positions,dirs])for(let k=0;k<3;k++){const a=i*3+k,b=j*3+k,v=data[a];data[a]=data[b];data[b]=v;}
      for(const data of [types,speeds]){const v=data[i];data[i]=data[j];data[j]=v;}
    }
    const posBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const dirBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, dirBuf);
    gl.bufferData(gl.ARRAY_BUFFER, dirs, gl.STATIC_DRAW);

    const typeBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, types, gl.STATIC_DRAW);

    const speedBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, speedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, speeds, gl.STATIC_DRAW);

    const webMvpLoc = gl.getUniformLocation(progWeb, 'u_mvp');
    const webTimeLoc = gl.getUniformLocation(progWeb, 'u_time');
    const webModeLoc = gl.getUniformLocation(progWeb, 'u_mode');
    const webDmLoc = gl.getUniformLocation(progWeb, 'u_dm_pot');
    const webDragLoc = gl.getUniformLocation(progWeb, 'u_drag');
    const webLensLoc = gl.getUniformLocation(progWeb, 'u_lens');
    const webSynapseLoc = gl.getUniformLocation(progWeb, 'u_synapse');

    // Controls State
    let currentMode = 0.0;
    let dmVal = 1.8;
    let dragVal = 2.4;
    let lensVal = 1.5;
    let synapseActive = 1;
    let showScan = 1;
    let scanPos = 0.0;
    let directorMode = false;

    // Camera
    let camRadius = 32.0;
    let camTheta = 0.25;
    let camPhi = 0.75;
    let isDragging = false;
    let lastX = 0, lastY = 0;

    function resize() { runtime.resize(canvas); }
    runtime.on(window, 'resize', resize);
    resize();

    runtime.camera(canvas, getState, setState, [8,80]);

    // Mode Selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
      runtime.on(btn, 'click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentMode = parseFloat(e.target.dataset.mode);
      });
    });

    // Sliders
    runtime.on(document.getElementById('param-dm'), 'input', (e) => {
      dmVal = parseFloat(e.target.value);
      document.getElementById('val-dm').innerText = dmVal.toFixed(2);
    });
    runtime.on(document.getElementById('param-drag'), 'input', (e) => {
      dragVal = parseFloat(e.target.value);
      document.getElementById('val-drag').innerText = dragVal.toFixed(2);
    });
    runtime.on(document.getElementById('param-lens'), 'input', (e) => {
      lensVal = parseFloat(e.target.value);
      document.getElementById('val-lens').innerText = lensVal.toFixed(2);
    });

    // Buttons
    const btnSynapse = document.getElementById('btn-synapse');
    runtime.on(btnSynapse, 'click', () => {
      synapseActive = synapseActive ? 0 : 1;
      btnSynapse.classList.toggle('active', synapseActive === 1);
    });

    const btnDirector = document.getElementById('btn-director');
    runtime.on(btnDirector, 'click', () => {
      directorMode = !directorMode;
      btnDirector.classList.toggle('active', directorMode);
    });

    const btnScan = document.getElementById('btn-scan');
    runtime.on(btnScan, 'click', () => {
      showScan = showScan ? 0 : 1;
      btnScan.classList.toggle('active', showScan === 1);
    });

    let audioCtx = null;
    let masterGain = null;
    let analyser = null;
    let audioActive = false;
    let lastScanTrigger = 0;

    const audioCanvas = document.getElementById('audio-canvas');
    const actx = audioCanvas.getContext('2d');

    // Pentatonic scale frequencies: C3, D3, E3, G3, A3, C4, D4, E4, G4, A4, C5
    const pentaScale = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25];

    const btnAudio = document.getElementById('btn-audio');
    runtime.on(btnAudio, 'click', () => {
      audioActive = !audioActive;
      btnAudio.classList.toggle('active', audioActive);
      if (audioActive) {
        initChandraAudio();
        btnAudio.innerText = '🔊 雷达声化中...';
      } else {
        if (masterGain && audioCtx) masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        btnAudio.innerText = '🔊 钱德拉雷达声化';
      }
    });

    function initChandraAudio() {
      if (!audioCtx) audioCtx = runtime.audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (masterGain) { masterGain.gain.cancelScheduledValues(audioCtx.currentTime); masterGain.gain.linearRampToValueAtTime(0.24, audioCtx.currentTime + 0.3); return; }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      masterGain = audioCtx.createGain(); runtime.keepAudio(masterGain);
      masterGain.gain.setValueAtTime(0.24, audioCtx.currentTime);
      masterGain.connect(analyser);
      analyser.connect(runtime.destination(audioCtx));
    }

    function triggerChandraBlip(yNorm, panVal, intensity=1) {
      if (!audioActive || !audioCtx) return;
      const noteIdx = Math.min(pentaScale.length - 1, Math.floor((1.0 - yNorm) * pentaScale.length));
      const freq = pentaScale[noteIdx];

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const pan = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
      const now = audioCtx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12 * intensity, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

      if (pan) {
        pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), now);
        osc.connect(gain);
        gain.connect(pan);
        pan.connect(masterGain);
      } else {
        osc.connect(gain);
        gain.connect(masterGain);
      }

      osc.start(now);
      osc.stop(now + 0.6);
    }

    // Audio Visualizer
    function drawAudioVisualizer() {
      
      actx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
      if (!audioActive || !analyser) {
        actx.fillStyle = 'rgba(179, 136, 255, 0.25)';
        actx.fillRect(0, audioCanvas.height / 2 - 1, audioCanvas.width, 2);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barWidth = (audioCanvas.width / bufferLength) * 2.2;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255.0) * audioCanvas.height;
        actx.fillStyle = `rgba(124, 77, 255, ${0.4 + dataArray[i] / 300.0})`;
        actx.fillRect(x, audioCanvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    }


    // Matrix Math
    const mat4Perspective = CosmosMath.mat4Perspective;

    const mat4LookAt = CosmosMath.mat4LookAt;

    const mat4Multiply = CosmosMath.mat4Multiply;

    const projMat = new Float32Array(16);
    const viewMat = new Float32Array(16);
    const mvpMat = new Float32Array(16);

    
    function render(now) {
      resize();

      const timeSec = now * 0.001;

      // Update radar scan position
      scanPos = (timeSec * 0.18) % 1.0;

      // Director Mode Camera
      if (directorMode && !Cosmos.settings.reduced) {
        camPhi = timeSec * 0.22;
        camTheta = 0.22 + Math.sin(timeSec * 0.3) * 0.28;
        camRadius = 30.0 + Math.cos(timeSec * 0.18) * 8.0;
      } else if (!Cosmos.settings.reduced && !isDragging) {
        camPhi += 0.0012 * 60 * Cosmos.delta;
      }

      const eye = [
        camRadius * Math.cos(camTheta) * Math.sin(camPhi),
        camRadius * Math.sin(camTheta),
        camRadius * Math.cos(camTheta) * Math.cos(camPhi)
      ];

      mat4Perspective(projMat, Math.PI / 3.8, canvas.width / canvas.height, 0.1, 200.0);
      mat4LookAt(viewMat, eye, [0, 0, 0], [0, 1, 0]);
      mat4Multiply(mvpMat, projMat, viewMat);

      // Sonify the actual projected, procedurally generated supercluster nodes.
      // Nodes share these world positions with the particle renderer; this is not observational data.
      if (audioActive && now - lastScanTrigger > 180) {
        const width = Math.min(0.06, (now - lastScanTrigger) * 0.00018);
        const candidates = CosmosMath.scanEvents(nodeCoords, mvpMat, (scanPos-width+1)%1, scanPos, currentMode, lensVal, timeSec);
        if (candidates.length) {
          const hit = candidates[0];
          triggerChandraBlip(hit.y, hit.pan, hit.intensity);
          lastScanTrigger = now;
        }
      }

      gl.clearColor(0.01, 0.012, 0.025, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Pass 1: Background Gas & Shockwaves
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progBg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(bgPosLoc);
      gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(bgResLoc, canvas.width, canvas.height);
      gl.uniform1f(bgTimeLoc, timeSec);
      gl.uniform1f(bgModeLoc, currentMode);
      gl.uniform1f(bgScanLoc, scanPos);
      gl.uniform1i(bgShowScanLoc, showScan);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: Cosmic Web 120,000 Particles
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(progWeb);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      const posAttr = gl.getAttribLocation(progWeb, 'a_position');
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, dirBuf);
      const dirAttr = gl.getAttribLocation(progWeb, 'a_dir');
      gl.enableVertexAttribArray(dirAttr);
      gl.vertexAttribPointer(dirAttr, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
      const typeAttr = gl.getAttribLocation(progWeb, 'a_type');
      gl.enableVertexAttribArray(typeAttr);
      gl.vertexAttribPointer(typeAttr, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, speedBuf);
      const speedAttr = gl.getAttribLocation(progWeb, 'a_speed');
      gl.enableVertexAttribArray(speedAttr);
      gl.vertexAttribPointer(speedAttr, 1, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix4fv(webMvpLoc, false, mvpMat);
      gl.uniform1f(webTimeLoc, timeSec);
      gl.uniform1f(webModeLoc, currentMode);
      gl.uniform1f(webDmLoc, dmVal);
      gl.uniform1f(webDragLoc, dragVal);
      gl.uniform1f(webLensLoc, lensVal);
      gl.uniform1f(webSynapseLoc, synapseActive);

      gl.drawArrays(gl.POINTS, 0, runtime.particles(PARTICLE_COUNT));

      
    }
    
  
    function getState() { return { pIdx, currentMode, dmVal, dragVal, lensVal, synapseActive, showScan, scanPos, directorMode, camRadius, camTheta, camPhi, isDragging, lastX, lastY, audioActive, lastScanTrigger }; }
    function setState(state) {
      if (Object.hasOwn(state, 'pIdx')) pIdx = state.pIdx;
      if (Object.hasOwn(state, 'currentMode')) currentMode = state.currentMode;
      if (Object.hasOwn(state, 'dmVal')) dmVal = state.dmVal;
      if (Object.hasOwn(state, 'dragVal')) dragVal = state.dragVal;
      if (Object.hasOwn(state, 'lensVal')) lensVal = state.lensVal;
      if (Object.hasOwn(state, 'synapseActive')) synapseActive = state.synapseActive;
      if (Object.hasOwn(state, 'showScan')) showScan = state.showScan;
      if (Object.hasOwn(state, 'scanPos')) scanPos = state.scanPos;
      if (Object.hasOwn(state, 'directorMode')) directorMode = state.directorMode;
      if (Object.hasOwn(state, 'camRadius')) camRadius = state.camRadius;
      if (Object.hasOwn(state, 'camTheta')) camTheta = state.camTheta;
      if (Object.hasOwn(state, 'camPhi')) camPhi = state.camPhi;
      if (Object.hasOwn(state, 'isDragging')) isDragging = state.isDragging;
      if (Object.hasOwn(state, 'lastX')) lastX = state.lastX;
      if (Object.hasOwn(state, 'lastY')) lastY = state.lastY;
      if (Object.hasOwn(state, 'audioActive')) audioActive = state.audioActive;
      if (Object.hasOwn(state, 'lastScanTrigger')) lastScanTrigger = state.lastScanTrigger;
    }
    return {draw:render,audioDraw:drawAudioVisualizer,getState,setState,audioEnabled:()=>audioActive,
      audioInfo(){const data=analyser?new Float32Array(analyser.fftSize):null;if(data)analyser.getFloatTimeDomainData(data);return {enabled:audioActive,context:audioCtx?.state||'none',gain:masterGain?.gain.value??0,rms:data?Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length):0};}};
});
