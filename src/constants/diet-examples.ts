/**
 * Dietas reales que entran en el bloque estático del prompt de generación.
 *
 * Son ejemplos: el modelo copia de ellas estructura, tono y nivel de detalle.
 * Viven aquí como constantes y no como ficheros porque el entorno de despliegue
 * es serverless y no hay filesystem en runtime, y porque el bloque estático del
 * prompt debe ser idéntico byte a byte entre peticiones para que la caché lo
 * reutilice — una conversión en vivo no lo garantiza.
 *
 * Origen: el PDF de una paciente real, convertido a markdown una vez y revisado
 * a mano (el PDF pierde ligaduras "ti"/"fi" al extraer texto, y su pie de página
 * se repite en cada página, cortando una de las cenas). El PDF no se versiona:
 * son datos de salud. Aquí solo queda el contenido, sin datos identificativos.
 *
 * Solo se vuelca el contenido. La portada, el logo, el @ de Instagram y el pie
 * de condiciones de cita son presentación: los pone la plantilla del PDF, no el
 * markdown, así que no entran aquí para que el modelo no los reproduzca.
 *
 * Para añadir otra dieta de ejemplo: escribir la constante y añadirla a la lista.
 * Ni el prompt ni la lógica de generación cambian.
 */

const EXAMPLE_DIET_1 = `# Plan nutricional

**Próxima revisión:** 8 de enero de 2026 / 13:00

**DIETA: 1400-1500 KCAL**

## Objetivos

- Como comentamos en revisión, el primer objetivo es reducir el porcentaje graso, mejorar la hidratación y aumentar la ingesta proteica para estimular la síntesis y crecimiento muscular.

## Suplementación

- Berberina y picolinato de cromo.
- Creatina, 5 gr al despertar después de tomar el Eutirox junto al café.
- Post-entreno (lunes, miércoles y viernes): batido de proteínas (30 gr) + pieza de fruta (libre).
  - Los martes y jueves solo consumiremos el batido de proteínas.

## Cantidades

- **Hidrato en comida:** 60 gr, o 200 gr de patata o batata.
  - **Hidrato en cena:** 30 gr, o 180 gr de patata o batata (de manera opcional añadir un día).
  - **Frutos secos:** 10 gr.
  - **Pan en tostadas o sándwiches:** 40 gr.
- **Proteína:** 140 gr de carne roja y 160 gr de pescado azul, blanco y carne blanca.
  - **Queso fresco:** 60 gr.
  - **Kéfir o queso batido:** 120 ml.
- **Gazpacho y cremas:** 150-200 ml.

## De lunes a viernes

**PRE-ENTRENO**
Café

**POST-ENTRENO**
Yogur proteico o plátano

## Plan nutricional

### Lunes: actividad

**COMIDA**
Salmón al horno con brócoli al vapor

**MERIENDA**
Yogur proteico + mandarina

**CENA**
Ensalada de pollo (pechuga, lechuga, pepino, aceite de oliva, aceitunas)

### Martes

**COMIDA**
Coliflor cocida y pollo a la plancha

**MERIENDA**
Pera

**CENA**
Ensalada de rúcula, jamón serrano y tomate

### Miércoles: actividad

**COMIDA**
Merluza a la plancha, patata asada y trigueros

**MERIENDA**
Kéfir (150 ml) + kiwi

**CENA**
Crema de zanahorias + 60 gr de jamón cocido

### Jueves

**COMIDA**
Chuleta de cerdo a la plancha y ensalada de col

**MERIENDA**
Mandarina + 50 gr de pavo

**CENA**
Ensalada de salmón ahumado, pepino y canónigos

### Viernes: actividad

**COMIDA**
Emperador a la plancha y calabacín salteado

**MERIENDA**
50 gr de jamón cocido + manzana

**CENA**
Sopa de verduras (con fideos) + huevo cocido

### Sábado

**COMIDA**
Zanahorias (airfryer) y salmón a la plancha

**MERIENDA**
Manzana

**CENA**
Wrap (1 pan de pita con queso fresco y pavo)

### Domingo

**COMIDA**
Pollo a la plancha y brócoli al vapor

**MERIENDA**
30 gr de lomo embuchado

**CENA**
Libre (sin hidrato)

## Observaciones

### Alimentos

- **Aceite:**
  - Cocinar: una cucharada y media.
  - Ensaladas: una cucharada.
- **Pan:** procurar consumir pan integral o de grano completo.
- **Refrescos:** permitido siempre que no se abuse de ellos y sean zero o light.
- **Verduras:** cualquier alimento que nazca de la tierra excepto la patata.
- **Agua:** mínimo 2,5 L al día.
- **Especias y picantes:** permitido sin su abuso.
- **Frutos secos:** se consumirán crudos, sin sal y sin ningún añadido.

### Evitar

- Alimentos industriales y procesados.
- Exceso de azúcar y sal.
- Alimentos fritos o rebozados.
- Alcohol.
- Pan:
  - Ingestas fuera del plan nutricional.
  - Blanco.
- En cenas:
  - Pescados azules grasos.
  - Carne roja.

### Técnicas culinarias

Asado, vapor (más recomendable), cocción y plancha.

### Hábitos

- Escucha a tu cuerpo (no pasa nada por saltarnos una comida si no tenemos hambre).
- Intenta realizar ingestas de alimentos no procesados (salvo excepción).
- Dedica el tiempo suficiente a cada comida.
- Realiza una comida o cena "social" a la semana.
- Aprende a disfrutar de los distintos tipos de alimentos y prueba alimentos nuevos.
- Realiza actividad física diaria.

**¡MUCHO ÁNIMO!**

---

Los cambios de una cita concertada deberán comunicarse con 24 horas de antelación, por el contrario:

- Aviso previo inferior a 12 h: se considerará cita realizada, por lo que se cargará el importe ÍNTEGRO en la siguiente cita.
- Aviso previo entre 12-24 h: se aplicará un incremento de 10 € en la siguiente cita. (1/1/20)`;

export type DietExample = {
  /** Identificador corto, solo para trazas y para saber cuál es cuál. */
  id: string;
  /** La dieta completa en markdown, tal cual entra en el prompt. */
  markdown: string;
};

/**
 * El orden importa: forma parte del bloque estático cacheado y debe ser estable.
 */
export const DIET_EXAMPLES: readonly DietExample[] = [
  { id: "example-1", markdown: EXAMPLE_DIET_1 },
] as const;
