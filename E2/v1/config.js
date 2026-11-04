// config.js — compartido por todas las páginas del prototipo.
// Declara los dispositivos que se pueden emparejar desde el QR de Protobject.
if (typeof Protobject !== "undefined") {
  Protobject.initialize([
    { name: "Visualización", page: "index.html" },
    { name: "Perilla", page: "knob.html" },
    { name: "Botones", page: "buttons.html" },
    { name: "NFC", page: "nfc.html" },
    { name: "Arduino", page: "arduino.html" },
  ]);
}
