/* bigbang scene: visual model, controls and chapter-specific sound. */
Cosmos.mount(function(runtime) {

    const canvas = document.getElementById('glcanvas');
    const gl = runtime.context(canvas);

    const createShader = runtime.shader;

    // Program 1: Fullscreen Background
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
    const bgEpochLoc = gl.getUniformLocation(progBg, 'u_epoch');
    const bgInflLoc = gl.getUniformLocation(progBg, 'u_inflation');

    // Program 2: 130,000 GPU Particles
    const vsPart = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs-particles').text);
    const fsPart = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs-particles').text);
    const progPart = runtime.program(gl, vsPart, fsPart);

    const PARTICLE_COUNT = 130000;
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

    const partMvpLoc = gl.getUniformLocation(progPart, 'u_mvp');
    const partEpochLoc = gl.getUniformLocation(progPart, 'u_epoch');
    const partTimeLoc = gl.getUniformLocation(progPart, 'u_time');
    const partInflLoc = gl.getUniformLocation(progPart, 'u_inflation');
    const partDmLoc = gl.getUniformLocation(progPart, 'u_dm');
    const partStarsLoc = gl.getUniformLocation(progPart, 'u_show_stars');

    // State Variables
    let currentEpoch = 0.0;
    let targetEpoch = 0.0;
    let inflationVal = 1.35;
    let dmVal = 0.268;
    let showStars = 1;
    let autoplay = false;
    let directorMode = false;

    // Camera
    let camRadius = 26.0;
    let camTheta = 0.25;
    let camPhi = 0.6;
    let isDragging = false;
    let lastX = 0, lastY = 0;

    function resize() { runtime.resize(canvas); }
    runtime.on(window, 'resize', resize);
    resize();

    runtime.camera(canvas, getState, setState, [8,80]);

    // Epoch Descriptions
    const epochTelemetry = [
      { name: "0.0 早期宇宙概念", age: "0 s", temp: "> 10³² K", curv: "早期条件未建模", scale: "0.000", dom: "量子重力未建模" },
      { name: "1.0 暴胀激波", age: "10⁻³² s", temp: "10²⁷ K", curv: "k = 0 (暴胀抹平)", scale: "e⁶⁰ 尺度跃迁", dom: "标量场假真空能" },
      { name: "2.0 夸克胶子汤", age: "10⁻⁶ s", temp: "10¹² K", curv: "平直时空", scale: "0.00001", dom: "相对论辐射主导" },
      { name: "3.0 CMB 光子退耦", age: "3.8×10⁵ yr", temp: "3000 K", curv: "平直时空", scale: "0.0009", dom: "物质主导与光子退耦" },
      { name: "4.0 首代原初星系", age: "2.9×10⁸ yr", temp: "45 K", curv: "平直时空", scale: "0.068", dom: "暗物质引力坍缩" },
      { name: "5.0 暗能量加速膨胀", age: "13.8 Gyr", temp: "2.725 K", curv: "k = 0", scale: "1.000", dom: "暗能量 (68.5%)" },
    ];

    function updateTelemetry(ep) {
      const idx = Math.min(5, Math.floor(ep));
      const nextIdx = Math.min(5, idx + 1);
      const frac = ep - idx;
      const cur = epochTelemetry[idx];
      const nxt = epochTelemetry[nextIdx];

      document.getElementById('val-epoch').innerText = ep.toFixed(2);
      document.getElementById('disp-age').innerHTML = frac > 0.5 ? nxt.age : cur.age;
      document.getElementById('disp-temp').innerHTML = frac > 0.5 ? nxt.temp : cur.temp;
      document.getElementById('disp-curv').innerHTML = cur.curv;
      document.getElementById('disp-scale').innerHTML = (idx * 0.2 + frac * 0.2).toFixed(3);
      document.getElementById('disp-dom').innerHTML = frac > 0.5 ? nxt.dom : cur.dom;
    }

    // Epoch Slider
    const paramEpoch = document.getElementById('param-epoch');
    runtime.on(paramEpoch, 'input', (e) => {
      targetEpoch = parseFloat(e.target.value);
      currentEpoch = targetEpoch;
      updateTelemetry(currentEpoch);
      syncEpochButtons(currentEpoch);
    });

    // Epoch Buttons
    const epochBtns = document.querySelectorAll('.epoch-btn');
    function syncEpochButtons(ep) {
      const roundEp = Math.round(ep);
      epochBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.step) === roundEp);
      });
    }
    epochBtns.forEach(btn => {
      runtime.on(btn, 'click', (e) => {
        targetEpoch = parseFloat(e.target.dataset.step);
        paramEpoch.value = targetEpoch;
        updateTelemetry(targetEpoch);
        syncEpochButtons(targetEpoch);
      });
    });

    // Other Sliders
    runtime.on(document.getElementById('param-inflation'), 'input', (e) => {
      inflationVal = parseFloat(e.target.value);
      document.getElementById('val-inflation').innerText = inflationVal.toFixed(2);
    });

    runtime.on(document.getElementById('param-dm'), 'input', (e) => {
      dmVal = parseFloat(e.target.value);
      document.getElementById('val-dm').innerText = dmVal.toFixed(3);
    });

    // Buttons
    const btnAutoplay = document.getElementById('btn-autoplay');
    runtime.on(btnAutoplay, 'click', () => {
      autoplay = !autoplay;
      btnAutoplay.classList.toggle('active', autoplay);
      btnAutoplay.innerText = autoplay ? '⏸️ 暂停演化' : '▶️ 纪元自动演进';
    });

    const btnDirector = document.getElementById('btn-director');
    runtime.on(btnDirector, 'click', () => {
      directorMode = !directorMode;
      btnDirector.classList.toggle('active', directorMode);
    });

    const btnStars = document.getElementById('btn-stars');
    runtime.on(btnStars, 'click', () => {
      showStars = showStars ? 0 : 1;
      btnStars.classList.toggle('active', showStars === 1);
    });

    let audioCtx = null;
    let masterGain = null;
    let oscBao = null;
    let filterBao = null;
    let analyser = null;
    let audioActive = false;

    const audioCanvas = document.getElementById('audio-canvas');
    const actx = audioCanvas.getContext('2d');

    const btnAudio = document.getElementById('btn-audio');
    runtime.on(btnAudio, 'click', () => {
      audioActive = !audioActive;
      btnAudio.classList.toggle('active', audioActive);
      if (audioActive) {
        initBigBangAudio();
        btnAudio.innerText = '🔊 宇宙声化中...';
      } else {
        if (masterGain && audioCtx) masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        btnAudio.innerText = '🔊 宇宙大爆炸声化';
      }
    });

    function initBigBangAudio() {
      if (!audioCtx) audioCtx = runtime.audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (masterGain) { masterGain.gain.cancelScheduledValues(audioCtx.currentTime); masterGain.gain.linearRampToValueAtTime(0.28, audioCtx.currentTime + 0.3); return; }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      masterGain = audioCtx.createGain(); runtime.keepAudio(masterGain);
      masterGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.28, audioCtx.currentTime + 1.0);
      masterGain.connect(analyser);
      analyser.connect(runtime.destination(audioCtx));

      // BAO Redshift Downsweep
      oscBao = audioCtx.createOscillator();
      oscBao.type = 'triangle';
      const freq = Math.max(32, 110.0 - currentEpoch * 16.0);
      oscBao.frequency.setValueAtTime(freq, audioCtx.currentTime);

      filterBao = audioCtx.createBiquadFilter();
      filterBao.type = 'lowpass';
      filterBao.frequency.setValueAtTime(260, audioCtx.currentTime);

      oscBao.connect(filterBao);
      filterBao.connect(masterGain);
      oscBao.start();
    }

    // Audio Visualizer
    function drawAudioVisualizer() {
      
      actx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
      if (!audioActive || !analyser) {
        actx.fillStyle = 'rgba(255, 183, 77, 0.25)';
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
        actx.fillStyle = `rgba(255, 152, 0, ${0.4 + dataArray[i] / 300.0})`;
        actx.fillRect(x, audioCanvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    }


    // 4x4 Matrix Helpers
    const mat4Perspective = CosmosMath.mat4Perspective;

    const mat4LookAt = CosmosMath.mat4LookAt;

    const mat4Multiply = CosmosMath.mat4Multiply;

    const projMat = new Float32Array(16);
    const viewMat = new Float32Array(16);
    const mvpMat = new Float32Array(16);

    
    function render(now) {
      resize();

      const timeSec = now * 0.001;

      // Autoplay Epoch Evolution
      if (autoplay && !Cosmos.settings.reduced) {
        currentEpoch = (currentEpoch + 0.006 * 60 * Cosmos.delta) % 5.05;
        targetEpoch = currentEpoch;
        paramEpoch.value = currentEpoch;
        updateTelemetry(currentEpoch);
        syncEpochButtons(currentEpoch);

      } else {
        currentEpoch += (targetEpoch - currentEpoch) * (1 - Math.exp(-4.8 * Cosmos.delta));
      }

      // The same demonstration epoch drives sound in manual and autoplay modes.
      if(oscBao&&audioCtx)oscBao.frequency.setTargetAtTime(Math.max(32,110-currentEpoch*16),audioCtx.currentTime,.03);
      // Director Mode Camera
      if (directorMode && !Cosmos.settings.reduced) {
        camPhi = timeSec * 0.25;
        camTheta = 0.2 + Math.sin(timeSec * 0.35) * 0.3;
        camRadius = 24.0 + Math.cos(timeSec * 0.2) * 6.0;
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

      // Pass 1: Fullscreen Primordial Energy Background
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progBg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(bgPosLoc);
      gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(bgResLoc, canvas.width, canvas.height);
      gl.uniform1f(bgTimeLoc, timeSec);
      gl.uniform1f(bgEpochLoc, currentEpoch);
      gl.uniform1f(bgInflLoc, inflationVal);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: 130,000 Additive GPU Particles
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(progPart);

      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
      const posAttr = gl.getAttribLocation(progPart, 'a_seed');
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
      const typeAttr = gl.getAttribLocation(progPart, 'a_type');
      gl.enableVertexAttribArray(typeAttr);
      gl.vertexAttribPointer(typeAttr, 1, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix4fv(partMvpLoc, false, mvpMat);
      gl.uniform1f(partEpochLoc, currentEpoch);
      gl.uniform1f(partTimeLoc, timeSec);
      gl.uniform1f(partInflLoc, inflationVal);
      gl.uniform1f(partDmLoc, dmVal);
      gl.uniform1i(partStarsLoc, showStars);

      gl.drawArrays(gl.POINTS, 0, runtime.particles(PARTICLE_COUNT));

      
    }
    
  
    function getState() { return { currentEpoch, targetEpoch, inflationVal, dmVal, showStars, autoplay, directorMode, camRadius, camTheta, camPhi, isDragging, lastX, lastY, audioActive }; }
    function setState(state) {
      if (Object.hasOwn(state, 'currentEpoch')) currentEpoch = state.currentEpoch;
      if (Object.hasOwn(state, 'targetEpoch')) targetEpoch = state.targetEpoch;
      if (Object.hasOwn(state, 'inflationVal')) inflationVal = state.inflationVal;
      if (Object.hasOwn(state, 'dmVal')) dmVal = state.dmVal;
      if (Object.hasOwn(state, 'showStars')) showStars = state.showStars;
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
