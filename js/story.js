/* story.js — Narrativa estática y definición de misiones.
   Datos planos, sin lógica pesada, huella de memoria mínima.

   Campos nuevos por misión:
   - tracked / trackMs: activa el modo "Doble Agente" (contrarreloj). Si el
     rastreo llega al 100% antes de terminar el nodo, el jugador es detectado.
   - corrupted: desde el NODO 5, la reproducción de la señal se mezcla con
     estática (Web Audio API) para dificultar la escucha de forma orgánica.
   - briefingAlert: texto alternativo de briefing si el nodo anterior terminó
     con la alarma alta (o tuvo que reiniciarse). Crea bifurcaciones de trama.
   - secret: línea de "archivo secreto" que se revela al activar Hackeo Veloz.
   - postAlert (solo NODO 6): final alternativo si el jugador arrastró
     demasiadas alertas a lo largo de la partida. */
(function (global) {
  "use strict";

  var MISSIONS = [
    {
      id: "NODE-1",
      title: "NODO 1 // CALIBRACIÓN",
      briefing: [
        "AGENTE NIGHTINGALE, aquí Central.",
        "Interceptamos una frecuencia abandonada. Úsala para calibrar tu descodificador.",
        "Escucha el pulso y repítelo en el botón. Punto corto, raya larga.",
        "Objetivo: NODO 1 — palabra de prueba."
      ],
      word: "ECO",
      unit: 260,
      noise: 0.03,
      alarmMax: 5,
      tracked: false,
      trackMs: 0,
      corrupted: false,
      secret: "LOG: frecuencia de calibración registrada a las 03:14.",
      post: [
        "Descodificado: ECO.",
        "Calibración correcta. El canal está limpio.",
        "Prepárate — la siguiente señal viene de un servidor real."
      ]
    },
    {
      id: "NODE-2",
      title: "NODO 2 // ACCESO",
      briefing: [
        "Detectamos tráfico cifrado saliendo de un servidor de logística enemigo.",
        "Necesitamos la palabra clave de acceso antes de que roten las llaves.",
        "Mantén el pulso estable. La estática empieza a subir."
      ],
      briefingAlert: [
        "Central detecta que activaste protocolos de emergencia en el NODO 1.",
        "Los guardias virtuales están en alerta elevada por tu torpeza inicial.",
        "Sé más preciso esta vez. Objetivo: NODO 2 — clave de acceso, bajo vigilancia reforzada."
      ],
      word: "CLAVE",
      unit: 240,
      noise: 0.06,
      alarmMax: 5,
      tracked: false,
      trackMs: 0,
      corrupted: false,
      secret: "LOG: la clave fue rotada hace 6 minutos. Alguien filtró el cambio.",
      post: [
        "Acceso concedido al NODO 2.",
        "Encontramos referencias a un topo dentro de nuestra propia red.",
        "Central quiere un nombre. Sigue escuchando."
      ]
    },
    {
      id: "NODE-3",
      title: "NODO 3 // EL TOPO",
      briefing: [
        "Un informante cifra mensajes cortos desde dentro del edificio.",
        "El tráfico es más largo. No te apresures entre símbolos.",
        "Aviso: esta subred tiene contravigilancia activa. Te pueden rastrear.",
        "Objetivo: identificar al topo."
      ],
      word: "TOPO",
      unit: 230,
      noise: 0.08,
      alarmMax: 4,
      tracked: true,
      trackMs: 26000,
      corrupted: false,
      secret: "LOG: el topo usa un pseudónimo de tres letras en todos los canales.",
      post: [
        "TOPO confirmado como término en clave, no como nombre real.",
        "Alguien más está protegiendo esa identidad.",
        "La señal del NODO 4 es más débil. Sube el volumen."
      ]
    },
    {
      id: "NODE-4",
      title: "NODO 4 // INTERFERENCIA",
      briefing: [
        "El enemigo añadió ruido deliberado a esta frecuencia.",
        "Ignora la estática de fondo, concéntrate solo en el tono de pulso.",
        "El rastreo sigue activo. No te quedes quieto escuchando de más.",
        "Objetivo: designación de la operación encubierta."
      ],
      briefingAlert: [
        "Tu torpeza en el NODO 3 activó un rastreo adicional en esta subred.",
        "El cortafuegos enemigo está más atento: cada error cuenta doble ahora.",
        "Objetivo: NODO 4 — designación de la operación encubierta. Cuidado."
      ],
      word: "FANTASMA",
      unit: 220,
      noise: 0.12,
      alarmMax: 4,
      tracked: true,
      trackMs: 22000,
      corrupted: false,
      secret: "LOG: el traspaso de FANTASMA incluye una copia de nuestras propias llaves.",
      post: [
        "OPERACIÓN FANTASMA: un traspaso de archivos programado para esta noche.",
        "Central cree que hay un agente doble coordinando la fuga.",
        "Última señal fuerte antes del apagón de radio: el NODO 5."
      ]
    },
    {
      id: "NODE-5",
      title: "NODO 5 // DOBLE JUEGO",
      briefing: [
        "Esta transmisión está firmada con las credenciales de un agente propio.",
        "Si lo que sospechamos es cierto, esta palabra confirmará la traición.",
        "A partir de aquí la señal viene sucia: habrá estática mezclada con el pulso.",
        "Mantén la calma. El pulso es rápido y te siguen rastreando."
      ],
      word: "TRAIDOR",
      unit: 210,
      noise: 0.14,
      alarmMax: 3,
      tracked: true,
      trackMs: 18000,
      corrupted: true,
      secret: "LOG: las credenciales del traidor tienen nivel de acceso a Central.",
      post: [
        "Confirmado: hay un traidor con acceso a Central.",
        "Todavía no sabemos su nombre en clave.",
        "Una última transmisión llega directamente del NODO 6, el núcleo."
      ]
    },
    {
      id: "NODE-6",
      title: "NODO 6 // NÚCLEO",
      briefing: [
        "Esta es la señal raíz. Todo lo demás era ruido para ocultarla.",
        "Descifra el nombre en clave del traidor antes de que corte la línea.",
        "Es tu última oportunidad, agente."
      ],
      briefingAlert: [
        "El NODO 5 dejó rastros. Central cree que te identificaron parcialmente.",
        "Esta es tu última oportunidad antes de que corten la línea por completo.",
        "Objetivo: NODO 6 — el núcleo. No falles."
      ],
      word: "AGENTE CERO",
      unit: 200,
      noise: 0.16,
      alarmMax: 3,
      tracked: true,
      trackMs: 15000,
      corrupted: true,
      secret: "LOG: el núcleo lleva encriptación de Central desde el día uno.",
      post: [
        "AGENTE CERO.",
        "El traidor eras... la propia Central que te entrenó.",
        "La transmisión termina en silencio.",
        "Fin de la infiltración. Gracias por jugar, NIGHTINGALE."
      ],
      postAlert: [
        "AGENTE CERO.",
        "El traidor eras... la propia Central que te entrenó.",
        "Pero tu rastro quedó expuesto en el camino: te detectaron a medio hackeo.",
        "La transmisión termina abruptamente. Extracción de emergencia activada.",
        "Fin de la infiltración (cubierta comprometida). Gracias por jugar, NIGHTINGALE."
      ]
    }
  ];

  global.Story = {
    MISSIONS: MISSIONS,
    total: MISSIONS.length
  };
})(window);
