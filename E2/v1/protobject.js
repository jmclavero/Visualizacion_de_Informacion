// Puente entre Protobject y la visualización.
// Recibe los mensajes de Botón y Micrófono y llama a las funciones de main.js.
(function () {
  if (typeof Protobject === "undefined" || !Protobject.Core) {
    console.warn("Protobject no está disponible; la viz funciona sin sensores.");
    return;
  }

  Protobject.Core.onReceived(function (mensaje) {
    if (!mensaje || typeof mensaje !== "object") return;

    switch (mensaje.tipo) {
      case "boton":
        if (typeof iniciarEscuchaVoz === "function") iniciarEscuchaVoz();
        break;
      case "voz":
        if (typeof actualizarEstadoVoz === "function") {
          actualizarEstadoVoz(mensaje.estado, mensaje.texto);
        }
        break;
      case "nombre":
        if (typeof manejarNombreVoz === "function") {
          manejarNombreVoz(mensaje.nombre);
        }
        break;
      default:
        break;
    }
  });
})();
