// Puente entre Protobject y la V4.
// La página del celular envía el nombre reconocido; la V4 no tiene botones.
(function () {
  if (typeof Protobject === "undefined" || !Protobject.Core) {
    console.warn("Protobject no está disponible; la V4 funciona sin micrófono.");
    return;
  }

  Protobject.Core.onReceived(function (mensaje) {
    if (!mensaje || typeof mensaje !== "object") return;

    switch (mensaje.tipo) {
      case "voz":
        if (typeof actualizarEstadoV4 === "function") {
          actualizarEstadoV4(mensaje.estado, mensaje.texto);
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

  Protobject.Core.onConnected(function (pagina) {
    // El evento también se dispara cuando la página principal abre su propia
    // conexión. Solo ocultamos el QR cuando se conecta el teléfono.
    if (typeof ocultarQRV4 === "function" && /voice\.html/i.test(String(pagina || ""))) {
      ocultarQRV4();
    }
  });
})();
