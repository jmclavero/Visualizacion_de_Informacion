// Prueba de hardware — barrido del servo en el pin 6.
//
// Sube este sketch para comprobar cableado, alimentación y servo,
// sin depender de Web Serial ni de Protobject.
//
// Placa: Arduino Leonardo (VID 0x2341, PID 0x8036).
// Servo: señal al pin 6, VCC a 5 V, GND común.

#include <Servo.h>

Servo servo;
const int PIN_SERVO = 6;

void setup() {
  servo.attach(PIN_SERVO);
}

void loop() {
  for (int angulo = 0; angulo <= 180; angulo++) {
    servo.write(angulo);
    delay(15);
  }
  for (int angulo = 180; angulo >= 0; angulo--) {
    servo.write(angulo);
    delay(15);
  }
}
