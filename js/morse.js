/* morse.js — Diccionario Morse y utilidades de patrón.
   Sin dependencias externas. Memoria: un único objeto estático. */
(function (global) {
  "use strict";

  var CODE = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
    G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
    M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
    S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
    Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----."
  };

  function patternFor(ch) {
    return CODE[ch.toUpperCase()] || "";
  }

  // Clasifica una pulsación (ms) como '.' o '-' según la unidad activa.
  // Devuelve null si la pulsación fue tan larga que se considera "atascada".
  function classify(durationMs, unit) {
    var dotMax = unit * 1.8;      // hasta ~1.8 unidades = punto
    var dashMax = unit * 6;       // hasta 6 unidades = raya válida
    if (durationMs <= dotMax) return ".";
    if (durationMs <= dashMax) return "-";
    return null; // se mantuvo pulsado demasiado tiempo
  }

  // Compara el buffer capturado contra el patrón objetivo.
  function matches(buffer, pattern) {
    return buffer === pattern;
  }

  global.Morse = {
    CODE: CODE,
    patternFor: patternFor,
    classify: classify,
    matches: matches
  };
})(window);
