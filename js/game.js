/* game.js — Lógica principal. Vanilla JS, sin frameworks.
   Se evita crear objetos nuevos dentro de bucles de animación
   para mantener el uso de heap muy por debajo del límite de 512MB. */
(function () {
  "use strict";

  var SAVE_KEY = "morseSpyDecoder.progress";
  var PARTICLE_POOL_SIZE = 16; // pool fijo, sin crecimiento de heap por partícula

  var el = {}; // referencias DOM, resueltas una sola vez
  var raf = null;
  var pulseT = 0;
  var glitchTimeout = null;
  var particlePool = [];
  var particlePoolIdx = 0;

  var state = {
    missionIndex: 0,
    letterIndex: 0,
    buffer: "",
    decoded: [],
    alarm: 0,
    isPressing: false,
    pressStart: 0,
    gapTimer: null,
    listenBusy: false,
    audioReady: false,
    muted: false,
    activity: 0, // 0..1, alimenta el visualizador de señal

    // Ondas reactivas
    pressAmp: 0,
    releaseAmp: 0,
    releaseDecay: 0.9,
    lastFrameTime: 0,

    // Combo / Hackeo Veloz
    score: 0,
    comboCount: 0,
    hackVeloz: false,
    letterListenCount: 0,
    letterHadFail: false,
    secretShownForMission: false,

    // Doble Agente (contrarreloj)
    trackActive: false,
    trackProgress: 0,
    trackMs: 0,

    // Bifurcaciones de trama
    restartedThisMission: false,
    highAlertFlags: []
  };

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    ["stage", "screen-start", "screen-briefing", "screen-game", "screen-post", "screen-end",
     "btn-start", "btn-continue-save",
     "briefing-title", "briefing-text", "btn-briefing-continue",
     "node-label", "alarm-meter", "decoded-word", "signal-canvas",
     "score-label", "combo-badge", "track-wrap", "track-fill",
     "decode-wrap", "particle-layer",
     "pattern-hint", "btn-listen", "btn-decode", "decode-led", "feedback-line",
     "post-title", "post-text", "btn-post-continue",
     "end-text", "btn-restart", "btn-mute"
    ].forEach(function (id) { el[id] = $(id); });
  }

  function initParticles() {
    var layer = el["particle-layer"];
    for (var i = 0; i < PARTICLE_POOL_SIZE; i++) {
      var span = document.createElement("span");
      span.className = "particle";
      layer.appendChild(span);
      particlePool.push(span);
    }
  }

  // Dispara partículas de datos (0/1) reutilizando el pool ya creado:
  // no se instancian nodos DOM nuevos durante el juego.
  function spawnParticles(count) {
    for (var i = 0; i < count; i++) {
      var p = particlePool[particlePoolIdx];
      particlePoolIdx = (particlePoolIdx + 1) % PARTICLE_POOL_SIZE;
      p.textContent = Math.random() < 0.5 ? "0" : "1";
      var dx = Math.round(Math.random() * 70 - 35);
      p.style.setProperty("--dx", dx + "px");
      p.classList.remove("active");
      void p.offsetWidth; // fuerza reflow para reiniciar la animación CSS
      p.classList.add("active");
    }
  }

  // ---- CRT / Glitch ----

  function triggerGlitch(hard) {
    var node = el["stage"];
    node.classList.remove("glitch", "glitch-hard");
    void node.offsetWidth;
    node.classList.add(hard ? "glitch-hard" : "glitch");
    if (glitchTimeout) clearTimeout(glitchTimeout);
    glitchTimeout = setTimeout(function () {
      node.classList.remove("glitch", "glitch-hard");
      glitchTimeout = null;
    }, hard ? 440 : 260);
  }

  function showScreen(id) {
    ["screen-start", "screen-briefing", "screen-game", "screen-post", "screen-end"]
      .forEach(function (s) { el[s].classList.remove("active"); });
    el[id].classList.add("active");
  }

  function saveProgress(n) {
    try { localStorage.setItem(SAVE_KEY, String(n)); } catch (e) { /* ignorar */ }
  }
  function loadProgress() {
    try {
      var v = parseInt(localStorage.getItem(SAVE_KEY) || "0", 10);
      return isNaN(v) ? 0 : v;
    } catch (e) { return 0; }
  }

  // ---- Flujo de pantallas ----

  function initStartScreen() {
    var progress = loadProgress();
    if (progress > 0 && progress < Story.total) {
      el["btn-continue-save"].style.display = "inline-block";
      el["btn-continue-save"].textContent = "Continuar (NODO " + (progress + 1) + ")";
    } else {
      el["btn-continue-save"].style.display = "none";
    }
  }

  function beginAt(missionIndex) {
    ensureAudio();
    state.missionIndex = missionIndex;
    showBriefing(missionIndex);
  }

  function showBriefing(idx) {
    var m = Story.MISSIONS[idx];
    // Bifurcación: si el nodo anterior terminó con la alarma alta (o hubo
    // que reiniciarlo), se usa un briefing alternativo, si existe.
    var useAlert = idx > 0 && state.highAlertFlags[idx - 1] && m.briefingAlert;
    var lines = useAlert ? m.briefingAlert : m.briefing;
    el["briefing-title"].textContent = m.title;
    el["briefing-text"].innerHTML = lines.map(function (l) {
      return "<p>" + escapeHtml(l) + "</p>";
    }).join("");
    showScreen("screen-briefing");
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function startMission(idx) {
    var m = Story.MISSIONS[idx];
    state.missionIndex = idx;
    state.letterIndex = 0;
    state.buffer = "";
    state.alarm = 0;
    state.decoded = m.word.split("").map(function (c) { return c === " " ? " " : null; });
    state.restartedThisMission = false;
    state.secretShownForMission = false;
    state.comboCount = 0;
    state.hackVeloz = false;
    resetLetterFlags();
    renderCombo();
    renderScore();

    el["node-label"].textContent = m.id;
    renderAlarm(m.alarmMax);
    renderDecoded();
    el["feedback-line"].textContent = "Esperando señal…";
    el["pattern-hint"].textContent = "";

    activateTrackingIfNeeded(m);
    SpyAudio.startAmbient(m.noise);
    showScreen("screen-game");
    skipSpacesIfNeeded();
  }

  function renderAlarm(max) {
    var m = Story.MISSIONS[state.missionIndex];
    var maxVal = max || m.alarmMax;
    var html = "";
    for (var i = 0; i < maxVal; i++) {
      html += '<span class="alarm-seg' + (i < state.alarm ? " lit" : "") + '"></span>';
    }
    el["alarm-meter"].innerHTML = html;
    if (maxVal > 1 && state.alarm >= maxVal - 1) {
      el["stage"].classList.add("alarm-critical");
    } else {
      el["stage"].classList.remove("alarm-critical");
    }
  }

  // ---- Combo / Hackeo Veloz ----

  function resetLetterFlags() {
    state.letterListenCount = 0;
    state.letterHadFail = false;
  }

  function renderScore() {
    el["score-label"].textContent = "PTS " + state.score;
  }

  function renderCombo() {
    el["combo-badge"].textContent = state.comboCount > 0 ? ("COMBO x" + state.comboCount) : "";
    el["combo-badge"].classList.toggle("hack-veloz", state.hackVeloz);
  }

  function activateHackVeloz() {
    state.hackVeloz = true;
    state.score += 25;
    var m = Story.MISSIONS[state.missionIndex];
    if (m.secret && !state.secretShownForMission) {
      state.secretShownForMission = true;
      el["feedback-line"].textContent = "HACKEO VELOZ — " + m.secret;
    } else {
      el["feedback-line"].textContent = "HACKEO VELOZ ACTIVADO. Puntuación x2.";
    }
  }

  function breakCombo() {
    state.comboCount = 0;
    state.hackVeloz = false;
  }

  // ---- Doble Agente (contrarreloj) ----

  function activateTrackingIfNeeded(m) {
    if (m.tracked) {
      state.trackActive = true;
      state.trackMs = m.trackMs;
      state.trackProgress = 0;
      el["track-wrap"].style.display = "flex";
      el["track-wrap"].classList.remove("critical");
      renderTrack();
    } else {
      state.trackActive = false;
      state.trackProgress = 0;
      el["track-wrap"].style.display = "none";
    }
  }

  function renderTrack() {
    el["track-fill"].style.width = Math.min(100, state.trackProgress * 100) + "%";
    el["track-wrap"].classList.toggle("critical", state.trackProgress > 0.7);
  }

  function updateTracking(dt) {
    if (!state.trackActive || !state.trackMs) return;
    var speedFactor = state.hackVeloz ? 0.55 : 1; // el combo ralentiza el rastreo
    state.trackProgress += (dt / state.trackMs) * speedFactor;
    if (state.trackProgress >= 1) {
      state.trackProgress = 1;
      renderTrack();
      detectedByTracking();
      return;
    }
    renderTrack();
  }

  function detectedByTracking() {
    if (!state.trackActive) return;
    state.trackActive = false;
    state.restartedThisMission = true;
    SpyAudio.alarmBlip();
    triggerGlitch(true);
    el["feedback-line"].textContent = "¡Te localizaron! Rastreo completo.";
    setTimeout(restartMissionAfterAlarm, 650);
  }

  function renderDecoded() {
    var out = state.decoded.map(function (c, i) {
      if (c === " ") return " ";
      if (c === null) {
        return i === state.letterIndex ? "_" : "_";
      }
      return c;
    }).join("");
    el["decoded-word"].textContent = out;
  }

  function currentTargetChar() {
    var m = Story.MISSIONS[state.missionIndex];
    return m.word[state.letterIndex];
  }

  function skipSpacesIfNeeded() {
    var m = Story.MISSIONS[state.missionIndex];
    while (state.letterIndex < m.word.length && m.word[state.letterIndex] === " ") {
      state.decoded[state.letterIndex] = " ";
      state.letterIndex++;
    }
    renderDecoded();
    if (state.letterIndex >= m.word.length) {
      missionComplete();
    }
  }

  function missionComplete() {
    saveProgress(state.missionIndex + 1);
    SpyAudio.stopAmbient();
    var m = Story.MISSIONS[state.missionIndex];
    state.trackActive = false;
    el["track-wrap"].style.display = "none";
    state.highAlertFlags[state.missionIndex] =
      state.restartedThisMission || (state.alarm >= m.alarmMax - 1);

    var isLast = state.missionIndex === Story.total - 1;
    if (isLast) {
      var alertCount = state.highAlertFlags.filter(Boolean).length;
      var useAlt = alertCount >= 3 && m.postAlert;
      var lines = useAlt ? m.postAlert : m.post;
      el["end-text"].innerHTML = lines.map(function (l) {
        return "<p>" + escapeHtml(l) + "</p>";
      }).join("");
      showScreen("screen-end");
    } else {
      el["post-title"].textContent = m.title + " — COMPLETO";
      el["post-text"].innerHTML = m.post.map(function (l) {
        return "<p>" + escapeHtml(l) + "</p>";
      }).join("");
      showScreen("screen-post");
    }
  }

  function restartMissionAfterAlarm() {
    var m = Story.MISSIONS[state.missionIndex];
    state.restartedThisMission = true;
    state.letterIndex = 0;
    state.buffer = "";
    state.alarm = 0;
    state.decoded = m.word.split("").map(function (c) { return c === " " ? " " : null; });
    breakCombo();
    resetLetterFlags();
    renderCombo();
    renderAlarm(m.alarmMax);
    renderDecoded();
    activateTrackingIfNeeded(m);
    el["feedback-line"].textContent = "Conexión perdida. Reintentando desde el inicio del nodo…";
    skipSpacesIfNeeded();
  }

  // ---- Reproducción de patrón (Escuchar) ----

  function playPattern(pattern, unit, corrupted, onDone) {
    var i = 0;
    el["pattern-hint"].textContent = "";
    function step() {
      if (i >= pattern.length) {
        SpyAudio.stopTone();
        if (onDone) onDone();
        return;
      }
      var sym = pattern[i];
      var dur = sym === "." ? unit : unit * 3;
      state.activity = 1;
      SpyAudio.startTone(620);
      // Pistas de audio corruptas (NODO 5+): estática superpuesta al pulso
      // real, obligando a agudizar el oído sin añadir gráficos nuevos.
      if (corrupted) SpyAudio.staticBurst(dur, 0.13 + Math.random() * 0.07);
      if (navigator.vibrate) {
        try { navigator.vibrate(dur); } catch (e) { /* ignorar */ }
      }
      setTimeout(function () {
        SpyAudio.stopTone();
        state.activity = 0;
        i++;
        setTimeout(step, unit * 1.1); // hueco entre símbolos
      }, dur);
    }
    step();
  }

  function onListenPressed() {
    if (state.listenBusy) return;
    ensureAudio();
    var m = Story.MISSIONS[state.missionIndex];
    var ch = currentTargetChar();
    if (!ch) return;
    var pattern = Morse.patternFor(ch);
    if (!pattern) return;
    state.listenBusy = true;
    state.letterListenCount++;
    el["btn-listen"].disabled = true;
    el["feedback-line"].textContent = m.corrupted ? "Transmitiendo entre estática…" : "Transmitiendo…";
    playPattern(pattern, m.unit, m.corrupted, function () {
      state.listenBusy = false;
      el["btn-listen"].disabled = false;
      el["feedback-line"].textContent = "Repite el patrón en el botón.";
    });
  }

  // ---- Captura de pulsaciones del jugador ----

  function ensureAudio() {
    if (!state.audioReady) {
      SpyAudio.resume();
      state.audioReady = true;
    }
  }

  function clearGapTimer() {
    if (state.gapTimer) {
      clearTimeout(state.gapTimer);
      state.gapTimer = null;
    }
  }

  function scheduleEvaluation() {
    clearGapTimer();
    var m = Story.MISSIONS[state.missionIndex];
    state.gapTimer = setTimeout(evaluateBuffer, m.unit * 3.4);
  }

  function evaluateBuffer() {
    var m = Story.MISSIONS[state.missionIndex];
    var ch = currentTargetChar();
    var target = Morse.patternFor(ch);
    if (!state.buffer) return;

    if (Morse.matches(state.buffer, target)) {
      state.decoded[state.letterIndex] = ch;
      state.buffer = "";
      el["pattern-hint"].textContent = "";
      SpyAudio.success();
      flashLed("ok");
      spawnParticles(6);

      // Combo: solo cuenta si la letra se acertó con una única escucha
      // (o ninguna) y sin fallos previos en ella.
      if (state.letterListenCount <= 1 && !state.letterHadFail) {
        state.comboCount++;
      } else {
        breakCombo();
      }
      if (state.comboCount > 0 && state.comboCount % 3 === 0) {
        activateHackVeloz();
      }
      state.score += 10 * (state.hackVeloz ? 2 : 1);
      renderScore();
      renderCombo();

      state.letterIndex++;
      resetLetterFlags();
      renderDecoded();
      if (!(state.comboCount > 0 && state.comboCount % 3 === 0)) {
        el["feedback-line"].textContent = "Correcto.";
      }
      skipSpacesIfNeeded();
    } else {
      state.buffer = "";
      el["pattern-hint"].textContent = "";
      state.alarm++;
      state.letterHadFail = true;
      breakCombo();
      renderCombo();
      SpyAudio.fail();
      flashLed("bad");
      triggerGlitch(false);
      renderAlarm();
      el["feedback-line"].textContent = "Patrón incorrecto. Escucha de nuevo si lo necesitas.";
      if (state.alarm >= m.alarmMax) {
        state.restartedThisMission = true;
        SpyAudio.alarmBlip();
        triggerGlitch(true);
        setTimeout(restartMissionAfterAlarm, 700);
      }
    }
  }

  function flashLed(kind) {
    el["decode-led"].className = "decode-led " + kind;
    setTimeout(function () {
      el["decode-led"].className = "decode-led";
    }, 220);
  }

  function onPressStart(e) {
    e.preventDefault();
    if (state.isPressing) return;
    ensureAudio();
    clearGapTimer();
    state.isPressing = true;
    state.pressStart = performance.now();
    state.activity = 1;
    state.pressAmp = 0.22;
    SpyAudio.tap();
    el["btn-decode"].classList.add("pressed");
  }

  function onPressEnd(e) {
    if (e) e.preventDefault();
    if (!state.isPressing) return;
    state.isPressing = false;
    state.activity = 0;
    el["btn-decode"].classList.remove("pressed");

    var m = Story.MISSIONS[state.missionIndex];
    var duration = performance.now() - state.pressStart;
    var sym = Morse.classify(duration, m.unit);

    // Onda reactiva: toque corto = pico rápido que decae deprisa;
    // pulsación larga = la onda ya expandida se asienta con más calma.
    if (sym === ".") {
      state.releaseAmp = 1.0;
      state.releaseDecay = 0.80;
    } else if (sym === "-") {
      state.releaseAmp = state.pressAmp;
      state.releaseDecay = 0.965;
    } else {
      state.releaseAmp = 0.35;
      state.releaseDecay = 0.85;
    }

    if (sym === null) {
      // Se mantuvo pulsado demasiado tiempo: se descarta el intento actual.
      state.buffer = "";
      el["pattern-hint"].textContent = "";
      el["feedback-line"].textContent = "Pulsación demasiado larga. Suelta antes.";
      return;
    }

    state.buffer += sym;
    el["pattern-hint"].textContent = state.buffer.replace(/\./g, "• ").replace(/-/g, "▬ ");
    scheduleEvaluation();
  }

  // ---- Visualizador de señal (canvas, decorativo y ligero) ----

  function updatePressAmplitude(now) {
    var m = Story.MISSIONS[state.missionIndex];
    if (state.isPressing) {
      var held = now - state.pressStart;
      var ratio = Math.min(1, held / (m.unit * 3)); // se acerca a la duración de raya
      state.pressAmp = 0.22 + ratio * 0.78;
    } else if (state.releaseAmp > 0.01) {
      state.releaseAmp *= state.releaseDecay;
    } else {
      state.releaseAmp = 0;
    }
  }

  function startSignalLoop() {
    var canvas = el["signal-canvas"];
    var ctx2d = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    state.lastFrameTime = performance.now();

    function frame(now) {
      if (now === undefined) now = performance.now();
      var dt = now - state.lastFrameTime;
      state.lastFrameTime = now;
      pulseT += 0.09;

      updatePressAmplitude(now);
      updateTracking(dt);

      ctx2d.clearRect(0, 0, w, h);
      ctx2d.strokeStyle = "rgba(57,255,20,0.8)";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      var reactive = state.isPressing ? state.pressAmp : state.releaseAmp;
      var amp = (h / 2 - 4) * (0.15 + Math.max(state.activity * 0.85, reactive));
      for (var x = 0; x < w; x++) {
        var y = h / 2 + Math.sin(x * 0.15 + pulseT) * amp * Math.sin(pulseT * 0.6 + x * 0.02);
        if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
      raf = requestAnimationFrame(frame);
    }
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function stopSignalLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // ---- Silencio ----

  function toggleMute() {
    state.muted = !state.muted;
    SpyAudio.setMuted(state.muted);
    el["btn-mute"].textContent = state.muted ? "🔇" : "🔊";
  }

  // ---- Enlace de eventos ----

  function bindEvents() {
    el["btn-start"].addEventListener("click", function () { beginAt(0); });
    el["btn-continue-save"].addEventListener("click", function () {
      beginAt(Math.min(loadProgress(), Story.total - 1));
    });
    el["btn-briefing-continue"].addEventListener("click", function () {
      startMission(state.missionIndex);
      startSignalLoop();
    });
    el["btn-post-continue"].addEventListener("click", function () {
      stopSignalLoop();
      showBriefing(state.missionIndex + 1);
    });
    el["btn-restart"].addEventListener("click", function () {
      saveProgress(0);
      stopSignalLoop();
      state.score = 0;
      state.comboCount = 0;
      state.hackVeloz = false;
      state.highAlertFlags = [];
      state.trackActive = false;
      el["track-wrap"].style.display = "none";
      el["stage"].classList.remove("glitch", "glitch-hard", "alarm-critical");
      renderScore();
      renderCombo();
      initStartScreen();
      showScreen("screen-start");
    });
    el["btn-listen"].addEventListener("click", onListenPressed);
    el["btn-mute"].addEventListener("click", toggleMute);

    var btn = el["btn-decode"];
    btn.style.touchAction = "none";
    btn.addEventListener("pointerdown", onPressStart);
    btn.addEventListener("pointerup", onPressEnd);
    btn.addEventListener("pointercancel", onPressEnd);
    btn.addEventListener("pointerleave", function (e) {
      if (state.isPressing) onPressEnd(e);
    });

    document.addEventListener("keydown", function (e) {
      if (e.code === "Space" && !e.repeat && document.getElementById("screen-game").classList.contains("active")) {
        onPressStart(e);
      }
    });
    document.addEventListener("keyup", function (e) {
      if (e.code === "Space") onPressEnd(e);
    });
  }

  function init() {
    cacheDom();
    initParticles();
    bindEvents();
    initStartScreen();
    showScreen("screen-start");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
