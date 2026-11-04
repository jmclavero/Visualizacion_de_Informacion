// Servo 180° — Entrega 2 (Visualización de Información, IIC2026).
//
// Sube este sketch UNA VEZ con Arduino IDE:
//   1. Placa: "Arduino Uno" (o el modelo de tu clon con CH340).
//   2. Instala el driver CH340 si el puerto no aparece.
//   3. Selecciona el puerto y presiona Subir.
//
// Conexión del servo:
//   - Señal (cable amarillo) -> pin 6
//   - VCC (rojo)            -> 5 V externo
//   - GND (negro/marrón)    -> GND del Arduino y del 5 V externo (tierra común)
//
// La página arduino.html envía por serial, a 9600 baudios:
//   A<ángulo>\n   (por ejemplo: "A135\n")
//
// No requiere librerías adicionales: solo la librería Servo incluida en el IDE.

#include <Servo.h>

Servo servo;
const int PIN_SERVO = 6;

void setup() {
  Serial.begin(9600);
  servo.attach(PIN_SERVO);
  servo.write(0);
}

void loop() {
  if (Serial.available() > 0) {
    String linea = Serial.readStringUntil('\n');
    linea.trim();

    if (linea.startsWith("A")) {
      int angulo = linea.substring(1).toInt();
      servo.write(constrain(angulo, 0, 180));
    }
  }
}
