/* audio.js — Todo el audio es procedural (Web Audio API).
   No se cargan archivos de audio: mantiene el juego muy ligero
   y evita picos de memoria en Safari iOS. */
(function (global) {
  "use strict";

  var ctx = null;
  var masterGain = null;
  var ambientGain = null;
  var sfxGain = null;
  var ambientNodes = null;
  var muted = false;
  var toneOsc = null; // oscilador reutilizado para el tono de pulso Morse
  var burstBuffer = null; // buffer de ruido corto reutilizado para "estática en la señal"

  function ensureContext() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.0;
    ambientGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(masterGain);

    return ctx;
  }

  // Genera un único buffer de ruido corto y lo reutiliza en bucle
  // (en vez de generar ruido continuamente), para minimizar asignaciones.
  function makeNoiseBuffer(seconds) {
    var sampleRate = ctx.sampleRate;
    var length = Math.floor(sampleRate * seconds);
    var buffer = ctx.createBuffer(1, length, sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function resume() {
    ensureContext();
    if (ctx.state === "suspended") ctx.resume();
  }

  function startAmbient(noiseLevel) {
    ensureContext();
    stopAmbient();

    // Zumbido grave (drone) con dos osciladores desafinados ligeramente.
    var drone1 = ctx.createOscillator();
    var drone2 = ctx.createOscillator();
    drone1.type = "sine";
    drone2.type = "sine";
    drone1.frequency.value = 55;
    drone2.frequency.value = 55.6;

    var droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;
    drone1.connect(droneGain);
    drone2.connect(droneGain);

    // Estática filtrada en bucle.
    var noiseBuf = makeNoiseBuffer(2);
    var noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    var noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 0.6;

    var noiseGain = ctx.createGain();
    noiseGain.gain.value = Math.max(0, Math.min(1, noiseLevel || 0.05));

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);

    droneGain.connect(ambientGain);
    noiseGain.connect(ambientGain);

    ambientGain.gain.cancelScheduledValues(ctx.currentTime);
    ambientGain.gain.setValueAtTime(0, ctx.currentTime);
    ambientGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);

    drone1.start();
    drone2.start();
    noiseSrc.start();

    ambientNodes = { drone1: drone1, drone2: drone2, noiseSrc: noiseSrc, noiseGain: noiseGain };
  }

  function setAmbientNoise(level) {
    if (ambientNodes && ambientNodes.noiseGain) {
      ambientNodes.noiseGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, level)), ctx.currentTime, 0.3
      );
    }
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      ambientNodes.drone1.stop();
      ambientNodes.drone2.stop();
      ambientNodes.noiseSrc.stop();
    } catch (e) { /* ya detenido */ }
    ambientNodes = null;
  }

  // Tono de pulso Morse: se enciende/apaga con start/stopTone para
  // reproducir un patrón de puntos y rayas con temporización externa.
  function startTone(freq) {
    ensureContext();
    stopTone();
    toneOsc = ctx.createOscillator();
    var g = ctx.createGain();
    toneOsc.type = "sine";
    toneOsc.frequency.value = freq || 620;
    g.gain.value = 0;
    toneOsc.connect(g);
    g.connect(sfxGain);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.008);
    toneOsc.start();
    toneOsc._gain = g;
  }

  function stopTone() {
    if (!toneOsc) return;
    var osc = toneOsc;
    var g = osc._gain;
    var now = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 0.015);
      osc.stop(now + 0.02);
    } catch (e) { /* noop */ }
    toneOsc = null;
  }

  // "Pistas de audio corruptas": ráfaga corta de estática filtrada que se
  // superpone al tono real. Reutiliza siempre el mismo buffer de ruido
  // (creado una sola vez) para no generar presión de memoria en iOS.
  function staticBurst(durationMs, level) {
    ensureContext();
    if (!burstBuffer) burstBuffer = makeNoiseBuffer(0.6);
    var src = ctx.createBufferSource();
    src.buffer = burstBuffer;
    src.loop = true;

    var filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1200 + Math.random() * 1000;
    filt.Q.value = 0.7;

    var g = ctx.createGain();
    var now = ctx.currentTime;
    var dur = Math.max(20, durationMs || 100) / 1000;
    var lvl = level == null ? 0.16 : level;

    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(lvl, now + 0.02);
    g.gain.linearRampToValueAtTime(0, now + dur);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  // --- SFX cortos, todos generados en el momento, sin buffers guardados ---

  function tap() {
    ensureContext();
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 900;
    g.gain.value = 0.15;
    o.connect(g); g.connect(sfxGain);
    var now = ctx.currentTime;
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.start(now); o.stop(now + 0.06);
  }

  function success() {
    ensureContext();
    var freqs = [660, 880, 1320];
    var now = ctx.currentTime;
    freqs.forEach(function (f, i) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(sfxGain);
      var t = now + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    });
  }

  function fail() {
    ensureContext();
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.25);
    g.gain.value = 0.2;
    o.connect(g); g.connect(sfxGain);
    var now = ctx.currentTime;
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    o.start(now); o.stop(now + 0.3);
  }

  function alarmBlip() {
    ensureContext();
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 1400;
    g.gain.value = 0.001;
    o.connect(g); g.connect(sfxGain);
    var now = ctx.currentTime;
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.start(now); o.stop(now + 0.13);
  }

  function setMuted(m) {
    muted = m;
    ensureContext();
    masterGain.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  }

  global.SpyAudio = {
    resume: resume,
    startAmbient: startAmbient,
    stopAmbient: stopAmbient,
    setAmbientNoise: setAmbientNoise,
    startTone: startTone,
    stopTone: stopTone,
    staticBurst: staticBurst,
    tap: tap,
    success: success,
    fail: fail,
    alarmBlip: alarmBlip,
    setMuted: setMuted
  };
})(window);
