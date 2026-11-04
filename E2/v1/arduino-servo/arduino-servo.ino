// Servo — Entrega 2 (Visualización de Información, IIC2026).
//
// Placa: Arduino Leonardo. Sube este sketch UNA VEZ con Arduino IDE o
// arduino-cli (FQBN arduino:avr:leonardo).
//
// Conexión del servo:
//   - Señal (cable amarillo) -> pin 6
//   - VCC (rojo)            -> 5 V externo (recomendado)
//   - GND (negro/marrón)    -> GND del Arduino y del 5 V externo (tierra común)
//
// Protocolo serial (9600 baudios):
//   A<ángulo>\n  -> mueve el servo (0..180)
//   N\n          -> vuelve al neutro y se detiene
//
// Respuestas:
//   Listo <neutro>
//   OK A<ángulo>
//   OK N <neutro>
//
// IMPORTANTE:
//   SERVO_CONTINUO = true  -> servo de rotación continua (360°).
//                             El neutro es 90 (detenido) y la magnitud se
//                             traduce en velocidad (90..150).
//   SERVO_CONTINUO = false -> servo de posición (180°).
//                             El neutro es 0 y el ángulo es la posición.
//
// Si tu servo es de 180° y quieres que la aguja se quede a la izquierda,
// cambia SERVO_CONTINUO a false y vuelve a subir el sketch.

#include <Servo.h>

const bool SERVO_CONTINUO = true;

Servo servo;
const int PIN_SERVO = 6;
const int NEUTRO = SERVO_CONTINUO ? 90 : 0;
const int VELOCIDAD_MAX = 60; // solo modo continuo: offset máximo desde 90

void mover(int angulo) {
  angulo = constrain(angulo, 0, 180);

  if (SERVO_CONTINUO) {
    // 90 = detenido; 90..150 = velocidad creciente según la magnitud.
    servo.write(90 + (angulo * VELOCIDAD_MAX) / 180);
  } else {
    servo.write(angulo);
  }
}

void setup() {
  Serial.begin(9600);
  servo.attach(PIN_SERVO);
  servo.write(NEUTRO);
  Serial.print("Listo ");
  Serial.println(NEUTRO);
}

void loop() {
  if (Serial.available() > 0) {
    String linea = Serial.readStringUntil('\n');
    linea.trim();

    if (linea == "N") {
      servo.write(NEUTRO);
      Serial.print("OK N ");
      Serial.println(NEUTRO);
    } else if (linea.startsWith("A")) {
      int angulo = constrain(linea.substring(1).toInt(), 0, 180);
      mover(angulo);
      Serial.print("OK A");
      Serial.println(angulo);
    }
  }
}
