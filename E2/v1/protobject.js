// Puente entre Protobject y la visualización.
// Recibe los mensajes de las páginas de sensores y llama a las funciones de
// main.js. Si Protobject no está disponible (sin conexión), no hace nada.
(function () {
  if (typeof Protobject === "undefined" || !Protobject.Core) {
    console.warn("Protobject no está disponible; la viz funciona sin sensores.");
    return;
  }

  Protobject.Core.onReceived(function (mensaje) {
    // El NFC podría enviar un string; el resto, objetos con "tipo".
    if (typeof mensaje === "string") {
      alternarCategoriaProtobject(mensaje);
      return;
    }
    if (!mensaje || typeof mensaje !== "object") return;

    // La perilla del proyectoenvía { angulo, vueltas } sin "tipo".
    if (!mensaje.tipo && typeof mensaje.angulo === "number") {
      manejarPerilla(mensaje.angulo);
      return;
    }

    switch (mensaje.tipo) {
      case "perilla":
        manejarPerilla(mensaje.angulo);
        break;
      case "nav":
        navegarPuntosSwarm(mensaje.dir);
        break;
      case "nfc":
        alternarCategoriaProtobject(mensaje.categoria);
        break;
      default:
        break;
    }
  });
})();
