## ADDED Requirements

### Requirement: Resumen breve de la consulta

Junto con los campos estructurados, la extracción SHALL producir un resumen breve de la consulta en texto: objetivo, cambios decididos respecto al plan anterior, restricciones y preferencias mencionadas y datos clínicos relevantes.

El resumen SHALL construirse solo con lo dicho en la transcripción, SHALL ser breve (unas pocas frases) y NO SHALL incluir datos que no aparezcan en ella.

Obtener el resumen NO SHALL retrasar la aparición del documento en pantalla. Si falla, SHALL aplicarse el mismo tratamiento que al fallo de la extracción: la consulta se guarda sin resumen y el fallo solo queda registrado en el servidor.

#### Scenario: Consulta con cambios y restricciones

- **WHEN** la transcripción dice que se sube la proteína y que el paciente ha desarrollado intolerancia a la lactosa
- **THEN** el resumen menciona la subida de proteína y la intolerancia a la lactosa

#### Scenario: Consulta sin datos clínicos nuevos

- **WHEN** la transcripción no menciona patologías, medicación ni intolerancias
- **THEN** el resumen no menciona ninguna

#### Scenario: La extracción falla

- **WHEN** la extracción falla
- **THEN** la consulta se guarda con el documento y sin resumen
- **AND** el usuario no ve un error de generación
