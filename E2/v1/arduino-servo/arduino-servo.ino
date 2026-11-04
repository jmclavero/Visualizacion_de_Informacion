// Servo 180° — Entrega 2 (Visualización de Información, IIC2026).
//
// Placa: Arduino Leonardo. Sube este sketch UNA VEZ con Arduino IDE o
// arduino-cli (FQBN arduino:avr:leonardo).
//
// Conexión del servo:
//   - Señal (cable amarillo) -> pin 6
//   - VCC (rojo)            -> 5 V externo (recomendado)
//   - GND (negro/marrón)    -> GND del Arduino y del 5 V externo (tierra común)
//
// La página arduino.html envía por serial:
//   A<ángulo>\n   (por ejemplo: "A135\n")
//
// El sketch responde "OK A<ángulo>" para que la página confirme la recepción.
// No requiere librerías adicionales: solo la librería Servo incluida en el IDE.

#include <Servo.h>

Servo servo;
const int PIN_SERVO = 6;

void setup() {
  Serial.begin(9600);
  servo.attach(PIN_SERVO);
  servo.write(0);
  Serial.println("Listo");
}

void loop() {
  if (Serial.available() > 0) {
    String linea = Serial.readStringUntil('\n');
    linea.trim();

    if (linea.startsWith("A")) {
      int angulo = constrain(linea.substring(1).toInt(), 0, 180);
      servo.write(angulo);
      Serial.print("OK A");
      Serial.println(angulo);
    }
  }
}
