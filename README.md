# Morse Spy Decoder

Juego narrativo minimalista de espionaje. Escuchas (y ves) patrones de punto/raya en Morse y los repites pulsando un único botón para descifrar mensajes y "hackear" servidores ficticios a lo largo de 6 nodos con una trama con bifurcaciones.

## Cómo probarlo

Abre `index.html` directamente en un navegador, o sirve la carpeta con cualquier servidor estático:

```
python3 -m http.server 8000
```

y visita `http://localhost:8000`. En iOS, ábrelo en Safari (el audio se activa tras el primer toque, por política del navegador).

## Estructura

- `index.html` — estructura y pantallas (inicio, briefing, juego, post-misión, final).
- `style.css` — estética terminal, totalmente responsive, respeta `safe-area-inset-*` para el notch de iOS. Incluye el overlay CRT, las animaciones de glitch, la barra de rastreo y las partículas de datos.
- `js/morse.js` — diccionario Morse y clasificación punto/raya según duración de pulsación.
- `js/story.js` — datos de las 6 misiones (briefing, palabra a descifrar, dificultad, texto posterior, bifurcaciones y modo Doble Agente).
- `js/audio.js` — todo el audio es procedural vía Web Audio API (ambiente + SFX + estática corrupta). No hay archivos de audio.
- `js/game.js` — lógica de juego, captura de pulsaciones, HUD, combo, rastreo, partículas y guardado de progreso (localStorage).

## Por qué cumple el límite de 512 MB de heap en Safari iOS

- Sin motor de juego ni framework: solo JS vanilla + DOM + Canvas2D.
- Cero assets binarios (imágenes, audio, fuentes externas): todo el sonido se sintetiza en tiempo real y la interfaz es DOM/CSS.
- El único `canvas` es pequeño (260×50) y el bucle de dibujo no crea objetos nuevos por frame.
- El audio reutiliza buffers de ruido cortos (ambiente y estática corrupta) en bucle en vez de generarlos continuamente.
- Las partículas de datos usan un *pool* fijo de 16 nodos DOM reutilizados: no se crean ni destruyen elementos durante la partida.
- El efecto CRT/glitch y las animaciones de partículas se hacen con CSS (`transform`/`opacity`), aprovechando el compositor en vez de JS por frame.
- `requestAnimationFrame` se cancela al salir de la pantalla de juego para no acumular trabajo en segundo plano.
- Tamaño total del proyecto: ~52 KB.

## Mecánica

1. Pulsa **Escuchar señal** para oír (y sentir, si el dispositivo soporta vibración) el patrón Morse de la letra objetivo.
2. Mantén pulsado el botón central: pulsación corta = punto, larga = raya. La onda verde reacciona en vivo a la pulsación.
3. Al dejar de pulsar durante un momento, el juego evalúa tu secuencia. Si coincide, la letra se revela y salen disparadas partículas de datos (0/1) del botón.
4. Tres o más fallos (según el nodo) disparan la alarma, un efecto de glitch y reinician el nodo actual.
5. Desde el NODO 3, algunos nodos activan el modo **Doble Agente**: una barra de rastreo sube mientras juegas; si llega al 100%, te detectan y reinicias el nodo.
6. Desde el NODO 5, la señal viene "corrupta": estática superpuesta al pulso real que obliga a afinar el oído.
7. Si descifras 3 letras seguidas sin reescuchar la señal ni fallar, se activa **Hackeo Veloz**: puntuación x2, el rastreo se ralentiza y se desbloquea una línea de "archivo secreto".
8. Si terminas un nodo con la alarma muy alta (o tienes que reiniciarlo), el briefing del siguiente nodo cambia para reflejar la alerta elevada — y el final de la partida puede variar si arrastras demasiadas alertas.
9. Completa los 6 nodos para desenmascarar al Agente Cero.

## Ajustar dificultad / contenido

Todo el contenido narrativo y de dificultad vive en `js/story.js` (array `MISSIONS`): `word` (texto a descifrar), `unit` (ms de la unidad Morse, menor = más rápido), `noise` (nivel de estática ambiente), `alarmMax` (fallos permitidos), `tracked`/`trackMs` (modo Doble Agente), `corrupted` (estática sobre la señal), `briefingAlert`/`postAlert` (bifurcaciones de trama) y `secret` (archivo desbloqueado con Hackeo Veloz).
