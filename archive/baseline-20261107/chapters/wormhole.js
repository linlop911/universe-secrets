/* wormhole scene: visual model, controls and chapter-specific sound. */
Cosmos.mount(function(runtime) {

    const canvas = document.getElementById('glcanvas');
    const gl = runtime.context(canvas);

    const createShader = runtime.shader;

    const vsQuad = createShader(gl, gl.VERTEX_SHADER, document.getElementById('vs-quad').text);
    const fsWormhole = createShader(gl, gl.FRAGMENT_SHADER, document.getElementById('fs-wormhole').text);
    const prog = runtime.program(gl, vsQuad, fsWormhole);
    gl.useProgram(prog);

    const quadBuf = runtime.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uCamPos = gl.getUniformLocation(prog, 'u_cam_pos');
    const uCamTarget = gl.getUniformLocation(prog, 'u_cam_target');
    const uRadius = gl.getUniformLocation(prog, 'u_throat_radius');
    const uTension = gl.getUniformLocation(prog, 'u_energy_tension');
    const uFidelity = gl.getUniformLocation(prog, 'u_bell_fidelity');
    const uMode = gl.getUniformLocation(prog, 'u_mode');
    const uInUnivB = gl.getUniformLocation(prog, 'u_in_universe_b');
    const uShowGlow = gl.getUniformLocation(prog, 'u_show_glow');

    // State Variables
    let throatRadius = 2.2;
    let energyTension = 1.45;
    let bellFidelity = 0.98;
    let currentMode = 0.0;
    let inUniverseB = 0;
    let showGlow = 1;
    let directorMode = false;

    // Camera
    let camRadius = 9.5;
    let camTheta = 0.15;
    let camPhi = 0.85;
    let isDragging = false;
    let lastX = 0, lastY = 0;
    let isTraversing = false;

    function resize() { runtime.resize(canvas); }
    runtime.on(window, 'resize', resize);
    resize();

    runtime.camera(canvas, getState, setState, [3.2,22]);

    // Mode Selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
      runtime.on(btn, 'click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentMode = parseFloat(e.target.dataset.mode);
      });
    });

    // Sliders
    runtime.on(document.getElementById('param-radius'), 'input', (e) => {
      throatRadius = parseFloat(e.target.value);
      document.getElementById('val-radius').innerText = throatRadius.toFixed(2);
      document.getElementById('disp-b0').innerHTML = `${(throatRadius * 2).toFixed(2)} <span class="unit">a.u.</span>`;
    });
    runtime.on(document.getElementById('param-tension'), 'input', (e) => {
      energyTension = parseFloat(e.target.value);
      document.getElementById('val-tension').innerText = energyTension.toFixed(2);
      document.getElementById('disp-casimir').innerHTML = `-${energyTension.toFixed(2)} <span class="unit">a.u.</span>`;
    });
    runtime.on(document.getElementById('param-fidelity'), 'input', (e) => {
      bellFidelity = parseFloat(e.target.value);
      document.getElementById('val-fidelity').innerText = bellFidelity.toFixed(2);
      document.getElementById('disp-entropy').innerText = bellFidelity.toFixed(2);
    });

    // Traverse Button Animation
    const btnTraverse = document.getElementById('btn-traverse');
    let traverseStart = 0, traverseRadius = 9.5, traverseUniverse = 0;
    runtime.on(btnTraverse, 'click', () => {
      if (isTraversing) return;
      isTraversing = true;
      btnTraverse.disabled = true;
      btnTraverse.innerText = '🚀 穿越虫洞喉部中...';

      playTraversalWhoosh();

      traverseRadius = camRadius;
      traverseUniverse = inUniverseB;
      traverseStart = Cosmos.info().elapsed;
    });

    // Buttons
    const btnDirector = document.getElementById('btn-director');
    runtime.on(btnDirector, 'click', () => {
      directorMode = !directorMode;
      btnDirector.classList.toggle('active', directorMode);
    });

    let audioCtx = null;
    let masterGain = null;
    let osc1 = null, osc2 = null;
    let analyser = null;
    let audioActive = false;

    const audioCanvas = document.getElementById('audio-canvas');
    const actx = audioCanvas.getContext('2d');

    const btnAudio = document.getElementById('btn-audio');
    runtime.on(btnAudio, 'click', () => {
      audioActive = !audioActive;
      btnAudio.classList.toggle('active', audioActive);
      if (audioActive) {
        initTunnelingAudio();
        btnAudio.innerText = '🔊 隧穿声化中...';
      } else {
        if (masterGain && audioCtx) masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        btnAudio.innerText = '🔊 量子隧穿音景';
      }
    });

    function initTunnelingAudio() {
      if (!audioCtx) audioCtx = runtime.audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (masterGain) { masterGain.gain.cancelScheduledValues(audioCtx.currentTime); masterGain.gain.linearRampToValueAtTime(0.24, audioCtx.currentTime + 0.3); return; }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      masterGain = audioCtx.createGain(); runtime.keepAudio(masterGain);
      masterGain.gain.setValueAtTime(0.24, audioCtx.currentTime);
      masterGain.connect(analyser);
      analyser.connect(runtime.destination(audioCtx));

      // Binaural Theta Drone: 108 Hz + 114 Hz (6 Hz binaural beat)
      osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(108, audioCtx.currentTime);

      osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(114, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, audioCtx.currentTime);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(masterGain);

      osc1.start();
      osc2.start();
    }

    function playTraversalWhoosh() {
      if (!audioCtx) audioCtx = runtime.audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const whooshOsc = audioCtx.createOscillator();
      const whooshGain = audioCtx.createGain();
      const now = audioCtx.currentTime;

      whooshOsc.type = 'triangle';
      whooshOsc.frequency.setValueAtTime(80, now);
      whooshOsc.frequency.exponentialRampToValueAtTime(620, now + 1.1);
      whooshOsc.frequency.exponentialRampToValueAtTime(50, now + 2.2);

      whooshGain.gain.setValueAtTime(0.001, now);
      whooshGain.gain.linearRampToValueAtTime(0.35, now + 1.1);
      whooshGain.gain.linearRampToValueAtTime(0.0001, now + 2.2);

      whooshOsc.connect(whooshGain);
      whooshGain.connect(runtime.destination(audioCtx));

      whooshOsc.start(now);
      whooshOsc.stop(now + 2.25);
    }

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


    
    function render(now) {
      resize();
      if (isTraversing) {
        const progress = Cosmos.settings.reduced ? 1 : Math.max(0, Math.min(1, (now - traverseStart) / 2200));
        camRadius = traverseRadius * (progress < .5 ? 1 - progress * 1.7 : .15 + (progress - .5) * 1.7);
        inUniverseB = progress < .5 ? traverseUniverse : 1 - traverseUniverse;
        document.getElementById('disp-universe').innerText = inUniverseB ? '程序天球 B' : '程序天球 A';
        if (progress === 1) { isTraversing = false; btnTraverse.disabled = false; btnTraverse.innerText = '🚀 穿越平行宇宙 (Traverse)'; }
      }

      const timeSec = now * 0.001;

      // Director Mode Camera
      if (directorMode && !Cosmos.settings.reduced && !isTraversing) {
        camPhi = timeSec * 0.3;
        camTheta = 0.22 + Math.sin(timeSec * 0.4) * 0.3;
        camRadius = 8.5 + Math.cos(timeSec * 0.25) * 2.5;
      } else if (!Cosmos.settings.reduced && !isDragging && !isTraversing) {
        camPhi += 0.0018 * 60 * Cosmos.delta;
      }

      const cx = camRadius * Math.cos(camTheta) * Math.sin(camPhi);
      const cy = camRadius * Math.sin(camTheta);
      const cz = camRadius * Math.cos(camTheta) * Math.cos(camPhi);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, timeSec);
      gl.uniform3f(uCamPos, cx, cy, cz);
      gl.uniform3f(uCamTarget, 0.0, 0.0, 0.0);
      gl.uniform1f(uRadius, throatRadius);
      gl.uniform1f(uTension, energyTension);
      gl.uniform1f(uFidelity, bellFidelity);
      gl.uniform1f(uMode, currentMode);
      gl.uniform1i(uInUnivB, inUniverseB);
      gl.uniform1i(uShowGlow, showGlow);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      
    }
    
  
    function getState() { return { traverseStart, traverseRadius, traverseUniverse, throatRadius, energyTension, bellFidelity, currentMode, inUniverseB, showGlow, directorMode, camRadius, camTheta, camPhi, isDragging, lastX, lastY, isTraversing, audioActive }; }
    function setState(state) {
      if (Object.hasOwn(state, 'traverseStart')) traverseStart = state.traverseStart;
      if (Object.hasOwn(state, 'traverseRadius')) traverseRadius = state.traverseRadius;
      if (Object.hasOwn(state, 'traverseUniverse')) traverseUniverse = state.traverseUniverse;
      if (Object.hasOwn(state, 'throatRadius')) throatRadius = state.throatRadius;
      if (Object.hasOwn(state, 'energyTension')) energyTension = state.energyTension;
      if (Object.hasOwn(state, 'bellFidelity')) bellFidelity = state.bellFidelity;
      if (Object.hasOwn(state, 'currentMode')) currentMode = state.currentMode;
      if (Object.hasOwn(state, 'inUniverseB')) inUniverseB = state.inUniverseB;
      if (Object.hasOwn(state, 'showGlow')) showGlow = state.showGlow;
      if (Object.hasOwn(state, 'directorMode')) directorMode = state.directorMode;
      if (Object.hasOwn(state, 'camRadius')) camRadius = state.camRadius;
      if (Object.hasOwn(state, 'camTheta')) camTheta = state.camTheta;
      if (Object.hasOwn(state, 'camPhi')) camPhi = state.camPhi;
      if (Object.hasOwn(state, 'isDragging')) isDragging = state.isDragging;
      if (Object.hasOwn(state, 'lastX')) lastX = state.lastX;
      if (Object.hasOwn(state, 'lastY')) lastY = state.lastY;
      if (Object.hasOwn(state, 'isTraversing')) isTraversing = state.isTraversing;
      if (Object.hasOwn(state, 'audioActive')) audioActive = state.audioActive;
    }
    return {draw:render,audioDraw:drawAudioVisualizer,getState,setState,audioEnabled:()=>audioActive,
      audioInfo(){const data=analyser?new Float32Array(analyser.fftSize):null;if(data)analyser.getFloatTimeDomainData(data);return {enabled:audioActive,context:audioCtx?.state||'none',gain:masterGain?.gain.value??0,rms:data?Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length):0};}};
});
