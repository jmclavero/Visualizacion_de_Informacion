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
// MODO ACTUAL: servo de posición de 180°.
//   Al arrancar va a 0° (izquierda) y espera las órdenes de la página.
//
// Si algún día usas un servo de rotación continua (360°), cambia
// SERVO_CONTINUO a true: el neutro será 90 (detenido) y la magnitud se
// traducirá en velocidad (90..150). Con false, el ángulo es la posición.

#include <Servo.h>

const bool SERVO_CONTINUO = false;

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
