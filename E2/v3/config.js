// config.js — dispositivos de E2/v3.
// Un solo celular con botón y micrófono.
if (typeof Protobject !== "undefined") {
  Protobject.initialize([
    { name: "Visualización", page: "index.html", main: true },
    { name: "Voz", page: "voice.html" },
  ]);
}
