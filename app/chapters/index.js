/* index scene: visual model, controls and chapter-specific sound. */
Cosmos.mount(function(runtime) {

    const canvas = document.getElementById('glcanvas');
    const gl = runtime.context(canvas);

    const createShader = runtime.shader;

    const vs = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs').text);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs').text);

    const program = runtime.program(gl, vs, fs);
    gl.useProgram(program);

    // Quad
    const positionBuffer = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);

    const posLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uCamPos = gl.getUniformLocation(program, 'u_cam_pos');
    const uCamTarget = gl.getUniformLocation(program, 'u_cam_target');
    const uSpin = gl.getUniformLocation(program, 'u_spin');
    const uDiskDensity = gl.getUniformLocation(program, 'u_disk_density');
    const uSpectralMode = gl.getUniformLocation(program, 'u_spectral_mode');
    const uDoppler = gl.getUniformLocation(program, 'u_doppler');
    const uJwstSpikes = gl.getUniformLocation(program, 'u_jwst_spikes');
    const uPenroseMode = gl.getUniformLocation(program, 'u_penrose_mode');

    // Camera State
    let camRadius = 14.0;
    let camTheta = 0.22;
    let camPhi = 0.85;
    let isDragging = false;
    let lastMouseX = 0, lastMouseY = 0;
    let directorMode = false;

    let massVal = 35.0;
    let spinVal = 0.94;
    let diskVal = 1.65;
    let spectralMode = 0.0;
    let dopplerActive = 1;
    let jwstSpikes = 1;
    let penroseActive = 0;

    function resize() { runtime.resize(canvas); }
    runtime.on(window, 'resize', resize);
    resize();

    runtime.camera(canvas, getState, setState, [4,30]);

    // Multi-spectral Filter Buttons
    document.querySelectorAll('.spectral-btn').forEach(btn => {
      runtime.on(btn, 'click', (e) => {
        document.querySelectorAll('.spectral-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        spectralMode = parseFloat(e.currentTarget.dataset.spec);
      });
    });

    // Real-time HUD Physics Calculations
    function updatePhysicsHUD() {
      const rsKm = (1.477 * massVal * (1.0 + Math.sqrt(Math.max(0, 1.0 - spinVal * spinVal)))).toFixed(1);
      const rphKm = (1.477 * massVal * (1.0 + Math.cos(2.0/3.0 * Math.acos(-spinVal))) * 2.0).toFixed(1);
      const dopplerFlux = (1.0 / Math.pow(Math.max(0.15, 1.0 - spinVal * 0.7), 3.0)).toFixed(2);
      const penroseDelta = (1.477 * massVal * (1-Math.sqrt(1-spinVal*spinVal))).toFixed(1);

      document.getElementById('disp-rs').innerHTML = `${rsKm} <span class="unit">km</span>`;
      document.getElementById('disp-rph').innerHTML = `${rphKm} <span class="unit">km</span>`;
      document.getElementById('disp-flux').innerHTML = `1 : ${dopplerFlux}`;
      document.getElementById('disp-penrose').innerHTML = `${penroseDelta} <span class="unit">km</span>`;
      document.getElementById('disp-time').innerHTML = `${(4.9255*massVal).toFixed(1)} <span class="unit">μs</span>`;
    }

    // Sliders
    runtime.on(document.getElementById('param-spin'), 'input', (e) => {
      spinVal = parseFloat(e.target.value);
      document.getElementById('val-spin').innerText = spinVal.toFixed(2);
      updatePhysicsHUD();
    });

    runtime.on(document.getElementById('param-mass'), 'input', (e) => {
      massVal = parseFloat(e.target.value);
      document.getElementById('val-mass').innerText = massVal.toFixed(1);
      updatePhysicsHUD();
    });

    runtime.on(document.getElementById('param-disk'), 'input', (e) => {
      diskVal = parseFloat(e.target.value);
      document.getElementById('val-disk').innerText = diskVal.toFixed(2);
    });

    // Buttons
    const btnDoppler = document.getElementById('btn-doppler');
    runtime.on(btnDoppler, 'click', () => {
      dopplerActive = dopplerActive ? 0 : 1;
      btnDoppler.classList.toggle('active', dopplerActive === 1);
    });

    const btnSpikes = document.getElementById('btn-spikes');
    runtime.on(btnSpikes, 'click', () => {
      jwstSpikes = jwstSpikes ? 0 : 1;
      btnSpikes.classList.toggle('active', jwstSpikes === 1);
    });

    const btnPenrose = document.getElementById('btn-penrose');
    runtime.on(btnPenrose, 'click', () => {
      penroseActive = penroseActive ? 0 : 1;
      btnPenrose.classList.toggle('active', penroseActive === 1);
    });

    const btnDirector = document.getElementById('btn-director');
    runtime.on(btnDirector, 'click', () => {
      directorMode = !directorMode;
      btnDirector.classList.toggle('active', directorMode);
    });

    let audioCtx = null;
    let masterGain = null;
    let osc1 = null, osc2 = null, osc3 = null;
    let analyser = null;
    let audioActive = false;

    const audioCanvas = document.getElementById('audio-canvas');
    const actx = audioCanvas.getContext('2d');

    const btnAudio = document.getElementById('btn-audio');
    runtime.on(btnAudio, 'click', () => {
      audioActive = !audioActive;
      btnAudio.classList.toggle('active', audioActive);
      if (audioActive) {
        initNasaChandraAudio();
        btnAudio.innerText = '🔊 黑洞合成声景中...';
      } else {
        if (masterGain && audioCtx) masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
        btnAudio.innerText = '🔊 钱德拉声音化';
      }
    });

    function initNasaChandraAudio() {
      if (!audioCtx) {
        audioCtx = runtime.audio();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      if (masterGain) { masterGain.gain.cancelScheduledValues(audioCtx.currentTime); masterGain.gain.linearRampToValueAtTime(0.26, audioCtx.currentTime + 0.3); return; }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      masterGain = audioCtx.createGain(); runtime.keepAudio(masterGain);
      masterGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.26, audioCtx.currentTime + 1.2);
      masterGain.connect(analyser);
      analyser.connect(runtime.destination(audioCtx));

      // Artistic three-oscillator drone; no observational audio is imported.
      osc1 = audioCtx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(54.0, audioCtx.currentTime);

      osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(108.0, audioCtx.currentTime);

      osc3 = audioCtx.createOscillator();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(162.0, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, audioCtx.currentTime);

      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(masterGain);

      osc1.start();
      osc2.start();
      osc3.start();
    }

    // LIGO Chirp Sound Generator
    runtime.on(document.getElementById('btn-chirp'), 'click', () => {
      if (!audioCtx) {
        audioCtx = runtime.audio();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const chirpOsc = audioCtx.createOscillator();
      const chirpGain = audioCtx.createGain();
      const now = audioCtx.currentTime;

      chirpOsc.type = 'sine';
      chirpOsc.frequency.setValueAtTime(35, now);
      chirpOsc.frequency.exponentialRampToValueAtTime(320, now + 1.4);

      chirpGain.gain.setValueAtTime(0.001, now);
      chirpGain.gain.exponentialRampToValueAtTime(0.35, now + 1.2);
      chirpGain.gain.linearRampToValueAtTime(0.0001, now + 1.45);

      chirpOsc.connect(chirpGain);
      chirpGain.connect(runtime.destination(audioCtx));

      chirpOsc.start(now);
      chirpOsc.stop(now + 1.5);
    });

    // Audio Visualizer
    function drawAudioVisualizer() {
      
      actx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
      if (!audioActive || !analyser) {
        actx.fillStyle = 'rgba(0, 229, 255, 0.25)';
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
        actx.fillStyle = `rgba(0, 229, 255, ${0.4 + dataArray[i] / 300.0})`;
        actx.fillRect(x, audioCanvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    }


    updatePhysicsHUD();

    // Main Render Loop
    
    function render(now) {
      resize();

      const timeSec = now * 0.001;

      // Director Mode Camera Flight or gentle orbit
      if (directorMode && !Cosmos.settings.reduced) {
        camPhi = timeSec * 0.35;
        camTheta = 0.28 + Math.sin(timeSec * 0.45) * 0.35;
        camRadius = 7.5 + Math.cos(timeSec * 0.3) * 2.0;
      } else if (!Cosmos.settings.reduced && !isDragging) {
        camPhi += 0.0018 * 60 * Cosmos.delta;
      }

      const cx = camRadius * Math.cos(camTheta) * Math.sin(camPhi);
      const cy = camRadius * Math.sin(camTheta);
      const cz = camRadius * Math.cos(camTheta) * Math.cos(camPhi);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, timeSec);
      gl.uniform3f(uCamPos, cx, cy, cz);
      gl.uniform3f(uCamTarget, 0.0, 0.0, 0.0);
      gl.uniform1f(uSpin, spinVal);
      gl.uniform1f(uDiskDensity, diskVal);
      gl.uniform1f(uSpectralMode, spectralMode);
      gl.uniform1i(uDoppler, dopplerActive);
      gl.uniform1i(uJwstSpikes, jwstSpikes);
      gl.uniform1i(uPenroseMode, penroseActive);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      
    }
    
  
    function getState() { return { camRadius, camTheta, camPhi, isDragging, lastMouseX, lastMouseY, directorMode, massVal, spinVal, diskVal, spectralMode, dopplerActive, jwstSpikes, penroseActive, audioActive }; }
    function setState(state) {
      if (Object.hasOwn(state, 'camRadius')) camRadius = state.camRadius;
      if (Object.hasOwn(state, 'camTheta')) camTheta = state.camTheta;
      if (Object.hasOwn(state, 'camPhi')) camPhi = state.camPhi;
      if (Object.hasOwn(state, 'isDragging')) isDragging = state.isDragging;
      if (Object.hasOwn(state, 'lastMouseX')) lastMouseX = state.lastMouseX;
      if (Object.hasOwn(state, 'lastMouseY')) lastMouseY = state.lastMouseY;
      if (Object.hasOwn(state, 'directorMode')) directorMode = state.directorMode;
      if (Object.hasOwn(state, 'massVal')) massVal = state.massVal;
      if (Object.hasOwn(state, 'spinVal')) spinVal = state.spinVal;
      if (Object.hasOwn(state, 'diskVal')) diskVal = state.diskVal;
      if (Object.hasOwn(state, 'spectralMode')) spectralMode = state.spectralMode;
      if (Object.hasOwn(state, 'dopplerActive')) dopplerActive = state.dopplerActive;
      if (Object.hasOwn(state, 'jwstSpikes')) jwstSpikes = state.jwstSpikes;
      if (Object.hasOwn(state, 'penroseActive')) penroseActive = state.penroseActive;
      if (Object.hasOwn(state, 'audioActive')) audioActive = state.audioActive;
    }
    return {draw:render,audioDraw:drawAudioVisualizer,getState,setState,audioEnabled:()=>audioActive,
      audioInfo(){const data=analyser?new Float32Array(analyser.fftSize):null;if(data)analyser.getFloatTimeDomainData(data);return {enabled:audioActive,context:audioCtx?.state||'none',gain:masterGain?.gain.value??0,rms:data?Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length):0};}};
});
