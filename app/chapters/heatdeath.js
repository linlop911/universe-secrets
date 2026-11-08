/* heatdeath scene: visual model, controls and chapter-specific sound. */
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
    const bgFlashLoc = gl.getUniformLocation(progBg, 'u_rebirth_flash');

    // Pass 2: Entropy Particles
    const vsEntropy = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs-entropy').text);
    const fsEntropy = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs-entropy').text);
    const progEntropy = runtime.program(gl, vsEntropy, fsEntropy);

    const PARTICLE_COUNT = 140000;
    const seeds = new Float32Array(PARTICLE_COUNT * 3);
    const types = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i * 3 + 0] = runtime.random();
      seeds[i * 3 + 1] = runtime.random();
      seeds[i * 3 + 2] = runtime.random();
      types[i] = runtime.random();
    }

    const seedBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

    const typeBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, types, gl.STATIC_DRAW);

    const entMvpLoc = gl.getUniformLocation(progEntropy, 'u_mvp');
    const entStageLoc = gl.getUniformLocation(progEntropy, 'u_stage');
    const entTimeLoc = gl.getUniformLocation(progEntropy, 'u_time');
    const entWLoc = gl.getUniformLocation(progEntropy, 'u_w');
    const entHawkingLoc = gl.getUniformLocation(progEntropy, 'u_hawking');
    const entFlashLoc = gl.getUniformLocation(progEntropy, 'u_rebirth_flash');

    // State Variables
    let currentStage = 0.0;
    let targetStage = 0.0;
    let wVal = -1.03;
    let hawkingVal = 1.6;
    let rebirthFlash = 0.0;
    let autoplay = false;
    let directorMode = false;

    // Camera
    let camRadius = 36.0;
    let camTheta = 0.28;
    let camPhi = 0.75;
    let isDragging = false;
    let lastX = 0, lastY = 0;

    function resize() { runtime.resize(canvas); }
    runtime.on(window, 'resize', resize);
    resize();

    runtime.camera(canvas, getState, setState, [8,80]);

    // Stage Telemetry
    const epochTelemetry = [
      { name: "0. 恒星繁衍期", temp: "2.725 K", entropy: "10⁹⁰ k_B", bh: "10¹² M_☉", dom: "发光星系与生命" },
      { name: "1. 简并枯竭期", temp: "0.015 K", entropy: "10¹⁰² k_B", bh: "10¹⁵ M_☉", dom: "白矮星与褐矮星" },
      { name: "2. 质子衰变假设", temp: "10⁻¹⁵ K", entropy: "10¹¹⁰ k_B", bh: "超大黑洞独存", dom: "假设质子不稳定" },
      { name: "3. 黑洞蒸发期", temp: "10⁻²⁴ K", entropy: "10¹²⁴ k_B", bh: "霍金蒸发终极爆发", dom: "辐射孤立光子" },
      { name: "4. 暗淡终局假设", temp: "10⁻³⁰ K", entropy: "S_max (最大熵)", bh: "遗迹质量未建模", dom: "可选假想重生动画" },
    ];

    function updateTelemetry(st) {
      const idx = Math.min(4, Math.floor(st));
      const nextIdx = Math.min(4, idx + 1);
      const frac = st - idx;
      const cur = epochTelemetry[idx];
      const nxt = epochTelemetry[nextIdx];

      document.getElementById('val-stage').innerText = `${st.toFixed(2)} (${cur.name.split(' ')[1]})`;
      document.getElementById('disp-temp').innerHTML = frac > 0.5 ? nxt.temp : cur.temp;
      document.getElementById('disp-entropy').innerHTML = frac > 0.5 ? nxt.entropy : cur.entropy;
      document.getElementById('disp-bh').innerHTML = frac > 0.5 ? nxt.bh : cur.bh;
      document.getElementById('disp-dom').innerHTML = frac > 0.5 ? nxt.dom : cur.dom;
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
    const epochBtns = document.querySelectorAll('.epoch-btn');
    function syncStageButtons(st) {
      const roundSt = Math.round(st);
      epochBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.step) === roundSt);
      });
    }
    epochBtns.forEach(btn => {
      runtime.on(btn, 'click', (e) => {
        targetStage = parseFloat(e.currentTarget.dataset.step);
        paramStage.value = targetStage;
        updateTelemetry(targetStage);
        syncStageButtons(targetStage);
      });
    });

    // Other Sliders
    runtime.on(document.getElementById('param-w'), 'input', (e) => {
      wVal = parseFloat(e.target.value);
      const modeDesc = wVal < -1 / 3 ? "假设暗能量主导：加速" : "假设暗能量主导：不加速";
      document.getElementById('val-w').innerText = `${wVal.toFixed(2)} (${modeDesc})`;
    });

    runtime.on(document.getElementById('param-hawking'), 'input', (e) => {
      hawkingVal = parseFloat(e.target.value);
      document.getElementById('val-hawking').innerText = hawkingVal.toFixed(2);
    });

    // Buttons
    const btnAutoplay = document.getElementById('btn-autoplay');
    runtime.on(btnAutoplay, 'click', () => {
      autoplay = !autoplay;
      btnAutoplay.classList.toggle('active', autoplay);
      btnAutoplay.innerText = autoplay ? '⏸️ 暂停演变' : '▶️ 对数演进播放';
    });

    const btnDirector = document.getElementById('btn-director');
    runtime.on(btnDirector, 'click', () => {
      directorMode = !directorMode;
      btnDirector.classList.toggle('active', directorMode);
    });

    // Poincaré Rebirth Action
    const btnRebirth = document.getElementById('btn-rebirth');
    runtime.on(btnRebirth, 'click', () => {
      playRebirthSound();
      rebirthFlash = 1.0;
      targetStage = 0.0;
      paramStage.value = 0;
      syncStageButtons(0);
      updateTelemetry(0);
    });

    let audioCtx = null;
    let masterGain = null;
    let oscHum = null;
    let analyser = null;
    let audioActive = false;

    const audioCanvas = document.getElementById('audio-canvas');
    const actx = audioCanvas.getContext('2d');

    const btnAudio = document.getElementById('btn-audio');
    runtime.on(btnAudio, 'click', () => {
      audioActive = !audioActive;
      btnAudio.classList.toggle('active', audioActive);
      if (audioActive) {
        initCosmicHumAudio();
        btnAudio.innerText = '🔊 沉寂声化中...';
      } else {
        if (masterGain && audioCtx) masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        btnAudio.innerText = '🔊 宇宙沉寂音景';
      }
    });

    function initCosmicHumAudio() {
      if (!audioCtx) audioCtx = runtime.audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (masterGain) { masterGain.gain.cancelScheduledValues(audioCtx.currentTime); masterGain.gain.linearRampToValueAtTime(0.24, audioCtx.currentTime + 0.3); return; }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      masterGain = audioCtx.createGain(); runtime.keepAudio(masterGain);
      masterGain.gain.setValueAtTime(0.24, audioCtx.currentTime);
      masterGain.connect(analyser);
      analyser.connect(runtime.destination(audioCtx));

      // Deep De Sitter 32.7 Hz Sub-bass Hum
      oscHum = audioCtx.createOscillator();
      oscHum.type = 'sine';
      oscHum.frequency.setValueAtTime(32.7, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, audioCtx.currentTime);

      oscHum.connect(filter);
      filter.connect(masterGain);
      oscHum.start();
    }

    function playRebirthSound() {
      if (!audioCtx) audioCtx = runtime.audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;

      // Resounding Big Bang rebirth chord
      [130.81, 196.00, 261.63, 392.00, 523.25].forEach(freq => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * 0.5, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 1.8);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(runtime.destination(audioCtx));

        osc.start(now);
        osc.stop(now + 2.5);
      });
    }

    // Audio Visualizer
    function drawAudioVisualizer() {
      
      actx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
      if (!audioActive || !analyser) {
        actx.fillStyle = 'rgba(234, 128, 252, 0.25)';
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
        actx.fillStyle = `rgba(170, 0, 255, ${0.4 + dataArray[i] / 300.0})`;
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

      // Rebirth Flash decay
      if (rebirthFlash > 0.001) {
        rebirthFlash *= Math.pow(0.94, 60 * Cosmos.delta);
      }

      // Director Mode Camera
      if (directorMode && !Cosmos.settings.reduced) {
        camPhi = timeSec * 0.22;
        camTheta = 0.25 + Math.sin(timeSec * 0.35) * 0.25;
        camRadius = 34.0 + Math.cos(timeSec * 0.2) * 8.0;
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

      gl.clearColor(0.01, 0.008, 0.02, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Pass 1: Background Vacuum & Core Flash
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progBg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(bgPosLoc);
      gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(bgResLoc, canvas.width, canvas.height);
      gl.uniform1f(bgTimeLoc, timeSec);
      gl.uniform1f(bgStageLoc, currentStage);
      gl.uniform1f(bgFlashLoc, rebirthFlash);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: 140,000 Particles
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(progEntropy);

      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
      const seedAttr = gl.getAttribLocation(progEntropy, 'a_seed');
      gl.enableVertexAttribArray(seedAttr);
      gl.vertexAttribPointer(seedAttr, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
      const typeAttr = gl.getAttribLocation(progEntropy, 'a_type');
      if (typeAttr !== -1) {
        gl.enableVertexAttribArray(typeAttr);
        gl.vertexAttribPointer(typeAttr, 1, gl.FLOAT, false, 0, 0);
      }

      gl.uniformMatrix4fv(entMvpLoc, false, mvpMat);
      gl.uniform1f(entStageLoc, currentStage);
      gl.uniform1f(entTimeLoc, timeSec);
      gl.uniform1f(entWLoc, wVal);
      gl.uniform1f(entHawkingLoc, hawkingVal);
      gl.uniform1f(entFlashLoc, rebirthFlash);

      gl.drawArrays(gl.POINTS, 0, runtime.particles(PARTICLE_COUNT));

      
    }
    
  
    function getState() { return { currentStage, targetStage, wVal, hawkingVal, rebirthFlash, autoplay, directorMode, camRadius, camTheta, camPhi, isDragging, lastX, lastY, audioActive }; }
    function setState(state) {
      if (Object.hasOwn(state, 'currentStage')) currentStage = state.currentStage;
      if (Object.hasOwn(state, 'targetStage')) targetStage = state.targetStage;
      if (Object.hasOwn(state, 'wVal')) wVal = state.wVal;
      if (Object.hasOwn(state, 'hawkingVal')) hawkingVal = state.hawkingVal;
      if (Object.hasOwn(state, 'rebirthFlash')) rebirthFlash = state.rebirthFlash;
      if (Object.hasOwn(state, 'autoplay')) autoplay = state.autoplay;
      if (Object.hasOwn(state, 'directorMode')) directorMode = state.directorMode;
      if (Object.hasOwn(state, 'camRadius')) camRadius = state.camRadius;
      if (Object.hasOwn(state, 'camTheta')) camTheta = state.camTheta;
      if (Object.hasOwn(state, 'camPhi')) camPhi = state.camPhi;
      if (Object.hasOwn(state, 'isDragging')) isDragging = state.isDragging;
      if (Object.hasOwn(state, 'lastX')) lastX = state.lastX;
      if (Object.hasOwn(state, 'lastY')) lastY = state.lastY;
      if (Object.hasOwn(state, 'audioActive')) audioActive = state.audioActive;
    }
    return {draw:render,audioDraw:drawAudioVisualizer,getState,setState,audioEnabled:()=>audioActive,
      audioInfo(){const data=analyser?new Float32Array(analyser.fftSize):null;if(data)analyser.getFloatTimeDomainData(data);return {enabled:audioActive,context:audioCtx?.state||'none',gain:masterGain?.gain.value??0,rms:data?Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length):0};}};
});
