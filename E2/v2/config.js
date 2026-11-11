// config.js — dispositivos de E2/v2.
// Un solo celular con botón y micrófono.
if (typeof Protobject !== "undefined") {
  Protobject.initialize([
    { name: "Visualización", page: "index.html", main: true },
    { name: "Voz", page: "voice.html?v=20261111e" },
  ]);
}
