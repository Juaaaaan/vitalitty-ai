## MODIFIED Requirements

### Requirement: Las revisiones editan la dieta anterior

Cuando el paciente ya tiene una dieta anterior, el sistema SHALL incluirla en el contexto de la generación, junto con la memoria del paciente (ficha y resúmenes de sus consultas recientes), e instruir al modelo para que **edite** la dieta anterior según lo dicho en la consulta, conservando lo que no se cuestiona.

Una revisión SHALL preservar las partes de la dieta anterior que la transcripción no menciona, y SHALL respetar las intolerancias, alergias y preferencias conocidas del paciente que la transcripción no retire. No SHALL regenerarse el documento en frío ignorando la dieta previa ni la memoria del paciente.

La existencia de dieta anterior SHALL determinarse por el paciente elegido explícitamente por el usuario, nunca por coincidencias en la transcripción.

#### Scenario: Revisión que cambia una sola cosa

- **WHEN** se genera la dieta de un paciente con dieta anterior y la transcripción solo habla de subir la proteína
- **THEN** el documento resultante refleja ese cambio
- **AND** el resto del plan se mantiene reconocible respecto a la dieta anterior

#### Scenario: Revisión que no repite restricciones conocidas

- **WHEN** se genera la dieta de un paciente existente con alergia a los frutos secos registrada y la transcripción no la menciona
- **THEN** el documento resultante no incluye frutos secos

#### Scenario: Primera consulta del paciente

- **WHEN** el paciente no tiene ninguna dieta anterior registrada
- **THEN** la generación procede sin bloque de dieta previa y produce el documento desde cero

### Requirement: Persistencia al cerrar el stream

Al completarse la generación, el sistema SHALL guardar la consulta con el documento generado, su número de versión dentro del paciente y, si está disponible, el resumen breve de la consulta, sin intervención del usuario.

Si la generación falla antes de completarse, no SHALL guardarse una consulta con una dieta incompleta ni SHALL consumirse un número de versión.

La subida del documento a almacenamiento de ficheros SHALL seguir siendo una acción explícita del usuario, independiente de este guardado.

#### Scenario: Generación completada

- **WHEN** el stream se cierra con el documento completo
- **THEN** queda registrada una consulta con la transcripción, el documento de dieta, su versión y su resumen
- **AND** el usuario ve en pantalla la versión de la dieta guardada
- **AND** el usuario puede a continuación subir el documento a almacenamiento como paso aparte

#### Scenario: Generación interrumpida

- **WHEN** la generación falla antes de completarse
- **THEN** no queda registrada ninguna consulta con dieta parcial
- **AND** la siguiente dieta completada de ese paciente recibe el número de versión que habría tenido la interrumpida
