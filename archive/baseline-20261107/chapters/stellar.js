/* stellar scene: visual model, controls and chapter-specific sound. */
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
    const bgStageLoc = gl.getUniformLocation(progBg, 'u_stage');

    // Pass 2: Stellar Particles
    const vsStellar = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs-stellar').text);
    const fsStellar = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs-stellar').text);
    const progStellar = runtime.program(gl, vsStellar, fsStellar);

    const PARTICLE_COUNT = 130000;
    const seeds = new Float32Array(PARTICLE_COUNT * 3);
    const types = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i * 3 + 0] = runtime.random();
      seeds[i * 3 + 1] = runtime.random();
      seeds[i * 3 + 2] = runtime.random();
      types[i] = runtime.random() * 3.5;
    }

    const seedBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

    const typeBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, types, gl.STATIC_DRAW);

    const stMvpLoc = gl.getUniformLocation(progStellar, 'u_mvp');
    const stStageLoc = gl.getUniformLocation(progStellar, 'u_stage');
    const stTimeLoc = gl.getUniformLocation(progStellar, 'u_time');
    const stMassLoc = gl.getUniformLocation(progStellar, 'u_mass');
    const stSpinLoc = gl.getUniformLocation(progStellar, 'u_spin');
    const stBeamLoc = gl.getUniformLocation(progStellar, 'u_show_beam');

    // State Variables
    let currentStage = 0.0;
    let targetStage = 0.0;
    let massVal = 25.0;
    let spinVal = 30.0;
    let showBeam = 1;
    let autoplay = false;
    let directorMode = false;

    // Camera
    let camRadius = 38.0;
    let camTheta = 0.22;
    let camPhi = 0.75;
    let isDragging = false;
    let lastX = 0, lastY = 0;

    function resize() { runtime.resize(canvas); }
    runtime.on(window, 'resize', resize);
    resize();

    runtime.camera(canvas, getState, setState, [8,80]);

    // Stage Telemetry
    const stageTelemetry = [
      { name: "0. 原恒星分子云", temp: "15 K", core: "分子云引力坍缩", pres: "1.2×10⁴ Pa", mag: "0.05 G", rproc: "未触发" },
      { name: "1. 主序星蓝超巨", temp: "38,000 K", core: "CNO循环氢聚变", pres: "4.5×10¹⁶ Pa", mag: "120 G", rproc: "未触发" },
      { name: "2. 红超巨星洋葱壳", temp: "3,400 K", core: "硅燃烧至铁核", pres: "1.8×10²¹ Pa", mag: "850 G", rproc: "触发生效前夜" },
      { name: "3. 仙后座A超新星", temp: "> 10⁹ K", core: "铁核坍缩反弹", pres: "1.5×10²⁸ Pa", mag: "10¹² G", rproc: "重元素示意（非产额计算）" },
      { name: "4. 蟹状星云脉冲星", temp: "1.2×10⁶ K", core: "简并中子态超流体", pres: "10³⁴ Pa", mag: "3.8×10¹² G", rproc: "完成抛洒" },
    ];

    function updateTelemetry(st) {
      const idx = Math.min(4, Math.floor(st));
      const nextIdx = Math.min(4, idx + 1);
      const frac = st - idx;
      const cur = stageTelemetry[idx];
      const nxt = stageTelemetry[nextIdx];

      document.getElementById('val-stage').innerText = st.toFixed(2);
      document.getElementById('disp-temp').innerHTML = frac > 0.5 ? nxt.temp : cur.temp;
      document.getElementById('disp-core').innerHTML = frac > 0.5 ? nxt.core : cur.core;
      document.getElementById('disp-pres').innerHTML = frac > 0.5 ? nxt.pres : cur.pres;
      document.getElementById('disp-mag').innerHTML = frac > 0.5 ? nxt.mag : cur.mag;
      document.getElementById('disp-rproc').innerHTML = frac > 0.5 ? nxt.rproc : cur.rproc;
    }

    // Stage Slider
    const paramStage = document.getElementById('param-stage');
    runtime.on(paramStage, 'input', (e) => {
      targetStage = parseFloat(e.target.value);
      currentStage = targetStage;
      updateTelemetry(currentStage);
      syncStageButtons(currentStage);
    });

    // Stage Buttons
    const stageBtns = document.querySelectorAll('.stage-btn');
    function syncStageButtons(st) {
      const roundSt = Math.round(st);
      stageBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.step) === roundSt);
      });
    }
    stageBtns.forEach(btn => {
      runtime.on(btn, 'click', (e) => {
        targetStage = parseFloat(e.target.dataset.step);
        paramStage.value = targetStage;
        updateTelemetry(targetStage);
        syncStageButtons(targetStage);
      });
    });

    // Other Sliders
    runtime.on(document.getElementById('param-mass'), 'input', (e) => {
      massVal = parseFloat(e.target.value);
      document.getElementById('val-mass').innerText = massVal.toFixed(1);
    });
    runtime.on(document.getElementById('param-spin'), 'input', (e) => {
      spinVal = parseFloat(e.target.value);
      document.getElementById('val-spin').innerText = spinVal.toFixed(1) + " Hz";
    });

    // Buttons
    const btnAutoplay = document.getElementById('btn-autoplay');
    runtime.on(btnAutoplay, 'click', () => {
      autoplay = !autoplay;
      btnAutoplay.classList.toggle('active', autoplay);
      btnAutoplay.innerText = autoplay ? '⏸️ 暂停演化' : '▶️ 生命周期循环';
    });

    const btnDirector = document.getElementById('btn-director');
    runtime.on(btnDirector, 'click', () => {
      directorMode = !directorMode;
      btnDirector.classList.toggle('active', directorMode);
    });

    const btnBeam = document.getElementById('btn-beam');
    runtime.on(btnBeam, 'click', () => {
      showBeam = showBeam ? 0 : 1;
      btnBeam.classList.toggle('active', showBeam === 1);
    });

    let audioCtx = null;
    let masterGain = null;
    let analyser = null;
    let audioActive = false;
    let pulsarInterval = null;
    let nextPulseTime = 0;

    const audioCanvas = document.getElementById('audio-canvas');
    const actx = audioCanvas.getContext('2d');

    const btnAudio = document.getElementById('btn-audio');
    runtime.on(btnAudio, 'click', () => {
      audioActive = !audioActive;
      btnAudio.classList.toggle('active', audioActive);
      if (audioActive) {
        initPulsarAudio();
        btnAudio.innerText = '🔊 脉冲星响铃中...';
      } else {
        if (pulsarInterval) runtime.clearTimeout(pulsarInterval);
        pulsarInterval = null;
        if (masterGain && audioCtx) masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
        btnAudio.innerText = '🔊 脉冲星射电时钟';
      }
    });

    function initPulsarAudio() {
      if (!audioCtx) {
        audioCtx = runtime.audio();
        runtime.on(audioCtx, 'statechange', () => { if(audioCtx.state==='running'&&audioActive&&pulsarInterval===null)schedulePulsar(); });
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.3);
        nextPulseTime = audioCtx.currentTime + 0.02;
        schedulePulsar();
        return;
      }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      masterGain = audioCtx.createGain(); runtime.keepAudio(masterGain);
      masterGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      masterGain.connect(analyser);
      analyser.connect(runtime.destination(audioCtx));

      nextPulseTime = audioCtx.currentTime + 0.02;
      schedulePulsar();
    }

    function schedulePulsar() {
      pulsarInterval = null;
      if (!audioActive || !audioCtx || audioCtx.state !== 'running') return;
      if (nextPulseTime < audioCtx.currentTime) nextPulseTime = audioCtx.currentTime + 0.01;
      while (nextPulseTime < audioCtx.currentTime + 0.1) {
        playPulsarClick(nextPulseTime);
        nextPulseTime += 1 / spinVal;
      }
      pulsarInterval = runtime.timeout(schedulePulsar, 25);
    }

    function playPulsarClick(now) {
      if (!audioActive || !audioCtx) return;

      // Click transient
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.012);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.02);
    }

    // Audio Visualizer
    function drawAudioVisualizer() {
      
      actx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
      if (!audioActive || !analyser) {
        actx.fillStyle = 'rgba(255, 171, 145, 0.25)';
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
        actx.fillStyle = `rgba(255, 112, 67, ${0.4 + dataArray[i] / 300.0})`;
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

      // Autoplay
      if (autoplay && !Cosmos.settings.reduced) {
        currentStage = (currentStage + 0.005 * 60 * Cosmos.delta) % 4.05;
        targetStage = currentStage;
        paramStage.value = currentStage;
        updateTelemetry(currentStage);
        syncStageButtons(currentStage);
      } else {
        currentStage += (targetStage - currentStage) * (1 - Math.exp(-4.8 * Cosmos.delta));
      }

      // Director Mode Camera
      if (directorMode && !Cosmos.settings.reduced) {
        camPhi = timeSec * 0.25;
        camTheta = 0.25 + Math.sin(timeSec * 0.35) * 0.28;
        camRadius = 36.0 + Math.cos(timeSec * 0.2) * 8.0;
      } else if (!Cosmos.settings.reduced && !isDragging) {
        camPhi += 0.0015 * 60 * Cosmos.delta;
      }

      const eye = [
        camRadius * Math.cos(camTheta) * Math.sin(camPhi),
        camRadius * Math.sin(camTheta),
        camRadius * Math.cos(camTheta) * Math.cos(camPhi)
      ];

      mat4Perspective(projMat, Math.PI / 3.8, canvas.width / canvas.height, 0.1, 200.0);
      mat4LookAt(viewMat, eye, [0, 0, 0], [0, 1, 0]);
      mat4Multiply(mvpMat, projMat, viewMat);

      gl.clearColor(0.01, 0.01, 0.02, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Pass 1: Background Nebula & Core Flare
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progBg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(bgPosLoc);
      gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(bgResLoc, canvas.width, canvas.height);
      gl.uniform1f(bgTimeLoc, timeSec);
      gl.uniform1f(bgStageLoc, currentStage);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: 130,000 Particles
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(progStellar);

      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
      const seedAttr = gl.getAttribLocation(progStellar, 'a_seed');
      gl.enableVertexAttribArray(seedAttr);
      gl.vertexAttribPointer(seedAttr, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
      const typeAttr = gl.getAttribLocation(progStellar, 'a_type');
      gl.enableVertexAttribArray(typeAttr);
      gl.vertexAttribPointer(typeAttr, 1, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix4fv(stMvpLoc, false, mvpMat);
      gl.uniform1f(stStageLoc, currentStage);
      gl.uniform1f(stTimeLoc, timeSec);
      gl.uniform1f(stMassLoc, massVal);
      gl.uniform1f(stSpinLoc, spinVal);
      gl.uniform1i(stBeamLoc, showBeam);

      gl.drawArrays(gl.POINTS, 0, runtime.particles(PARTICLE_COUNT));

      
    }
    
  
    function getState() { return { currentStage, targetStage, massVal, spinVal, showBeam, autoplay, directorMode, camRadius, camTheta, camPhi, isDragging, lastX, lastY, audioActive, nextPulseTime }; }
    function setState(state) {
      if (Object.hasOwn(state, 'currentStage')) currentStage = state.currentStage;
      if (Object.hasOwn(state, 'targetStage')) targetStage = state.targetStage;
      if (Object.hasOwn(state, 'massVal')) massVal = state.massVal;
      if (Object.hasOwn(state, 'spinVal')) spinVal = state.spinVal;
      if (Object.hasOwn(state, 'showBeam')) showBeam = state.showBeam;
      if (Object.hasOwn(state, 'autoplay')) autoplay = state.autoplay;
      if (Object.hasOwn(state, 'directorMode')) directorMode = state.directorMode;
      if (Object.hasOwn(state, 'camRadius')) camRadius = state.camRadius;
      if (Object.hasOwn(state, 'camTheta')) camTheta = state.camTheta;
      if (Object.hasOwn(state, 'camPhi')) camPhi = state.camPhi;
      if (Object.hasOwn(state, 'isDragging')) isDragging = state.isDragging;
      if (Object.hasOwn(state, 'lastX')) lastX = state.lastX;
      if (Object.hasOwn(state, 'lastY')) lastY = state.lastY;
      if (Object.hasOwn(state, 'audioActive')) audioActive = state.audioActive;
      if (Object.hasOwn(state, 'nextPulseTime')) nextPulseTime = state.nextPulseTime;
    }
    return {draw:render,audioDraw:drawAudioVisualizer,getState,setState,audioEnabled:()=>audioActive,
      audioInfo(){const data=analyser?new Float32Array(analyser.fftSize):null;if(data)analyser.getFloatTimeDomainData(data);return {enabled:audioActive,context:audioCtx?.state||'none',gain:masterGain?.gain.value??0,rms:data?Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length):0};}};
});
