// config.js — dispositivos del prototipo.
// Solo Visualización (PC), Botón y Micrófono (un celular cada uno).
if (typeof Protobject !== "undefined") {
  Protobject.initialize([
    { name: "Visualización", page: "index.html", main: true },
    { name: "Botón", page: "button.html" },
    { name: "Micrófono", page: "microphone.html" },
  ]);
}
