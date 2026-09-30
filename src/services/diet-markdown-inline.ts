/**
 * Renderizador de markdown reducido al subconjunto que usan las dietas.
 *
 * Cubre lo que el contrato produce: párrafos, listas con viñeta anidadas por
 * sangría, negrita, itálica y código en línea. No hay tablas, enlaces, imágenes
 * ni HTML embebido, y lo que no reconoce sale como texto escapado.
 *
 * Se escribe aquí en lugar de traer una librería de markdown porque el
 * documento entra en una plantilla de marca, no en una página libre: aceptar
 * HTML arbitrario dentro del PDF permitiría al contenido colarse en la maqueta
 * o suplantar los elementos fijos, que es justo lo que el contrato impide.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Negrita, itálica y código en línea sobre texto ya escapado. */
export function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:]|$)/g, "$1<em>$2</em>");
}

interface ListItem {
  depth: number;
  text: string;
}

/** Construye listas anidadas a partir de la sangría de cada viñeta. */
function renderList(items: ListItem[]): string {
  let html = "";
  const open: number[] = [];

  for (const item of items) {
    while (open.length > 0 && item.depth < open[open.length - 1]) {
      html += "</li></ul>";
      open.pop();
    }

    if (open.length === 0 || item.depth > open[open.length - 1]) {
      html += "<ul>";
      open.push(item.depth);
    } else {
      html += "</li>";
    }

    html += `<li>${renderInline(item.text)}`;
  }

  while (open.length > 0) {
    html += "</li></ul>";
    open.pop();
  }

  return html;
}

export function renderMarkdownBlock(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: ListItem[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    html.push(renderList(list));
    list = [];
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Subtítulo dentro de una sección. Observaciones los usa para agrupar
    // (Horarios, Alimentos, Técnicas culinarias, Hábitos); sin esto salían
    // como el texto literal "### Horarios de referencia" dentro de un párrafo.
    const subheading = /^(#{3,6})\s+(.+?)$/.exec(trimmed);

    if (subheading) {
      flushList();
      flushParagraph();
      const level = subheading[1].length === 3 ? "h4" : "h5";
      html.push(`<${level}>${renderInline(subheading[2].trim())}</${level}>`);
      continue;
    }

    // Una línea que es solo negrita encabeza lo que viene debajo: así escribe
    // el generador las ingestas de cada día (`**COMIDA (15:00)**`) y los
    // bloques de pre/post-entreno. No se filtra por un vocabulario cerrado,
    // porque el generador pega la hora a la etiqueta y usa nombres que ninguna
    // lista cubre; el resultado era que quedaban pegadas a su texto en el
    // mismo párrafo, cuando el original las pone en su propia línea.
    const label = /^\*\*(.+?)\*\*$/.exec(trimmed);

    if (label) {
      flushList();
      flushParagraph();
      html.push(`<h4>${renderInline(label[1].trim())}</h4>`);
      continue;
    }

    const bullet = /^(\s*)[-*•o▪]\s+(.*)$/.exec(line);

    if (bullet) {
      flushParagraph();
      // Dos espacios por nivel, que es como sangra el generador; se redondea
      // hacia abajo para que cuatro espacios no creen un nivel fantasma.
      list.push({
        depth: Math.floor(bullet[1].replace(/\t/g, "  ").length / 2),
        text: bullet[2].trim(),
      });
      continue;
    }

    if (line.trim().length === 0) {
      flushList();
      flushParagraph();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushList();
  flushParagraph();

  return html.join("");
}
