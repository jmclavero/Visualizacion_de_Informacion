// Puente entre Protobject y la visualización.
// La página Voz envía el estado y el nombre reconocido.
(function () {
  if (typeof Protobject === "undefined" || !Protobject.Core) {
    console.warn("Protobject no está disponible; la viz funciona sin sensores.");
    return;
  }

  Protobject.Core.onReceived(function (mensaje) {
    if (!mensaje || typeof mensaje !== "object") return;

    switch (mensaje.tipo) {
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

  // Cuando el celular termine de escanear/ conectar, cerramos el QR y el
  // menú para que no tapen la visualización.
  Protobject.Core.onConnected(function () {
    document
      .querySelectorAll(".qr-code-container, .dropdown-menu")
      .forEach(function (el) {
        el.remove();
      });
  });
})();
