/**
 * Supabase en memoria para los tests del Cerebro.
 *
 * Reproduce las tres cosas que el Cerebro le pide a la base de datos y que un
 * mock de llamadas sueltas no cubriría:
 *
 *   - RLS: cada fila lleva `created_by` y solo se ve la del usuario de la
 *     sesión, igual que con las políticas reales. Eso permite probar el
 *     aislamiento sin dos usuarios de verdad;
 *   - el trigger de versión: `version` se asigna como máximo del padre + 1 al
 *     insertar, nunca desde el código de aplicación;
 *   - las tablas de versiones son solo-inserción: un `update` sobre una versión
 *     devuelve error, como lo haría la falta de política.
 */

type Row = Record<string, unknown>;

type TableName =
  | "prompts"
  | "prompt_versiones"
  | "documentos_conocimiento"
  | "documento_versiones";

/** Tabla de versiones -> columna que apunta a su cabecera. */
const VERSION_PARENT: Partial<Record<TableName, string>> = {
  prompt_versiones: "prompt_id",
  documento_versiones: "documento_id",
};

/** Nombre embebido en un select -> cómo se une con la tabla padre. */
const EMBEDS: Record<string, { table: TableName; foreignKey: string }> = {
  prompt_versiones: { table: "prompt_versiones", foreignKey: "prompt_id" },
  documento_versiones: {
    table: "documento_versiones",
    foreignKey: "documento_id",
  },
};

export type FakeTables = Partial<Record<TableName, Row[]>>;

export type FakeSupabaseOptions = {
  /** Usuario de la sesión: lo que RLS usa para filtrar. */
  userId: string;
  tables?: FakeTables;
  /** Fuerza un error en los `select` de estas tablas, para probar el fallback. */
  failSelectOn?: TableName[];
};

export type FakeSupabase = {
  from: (table: TableName) => FakeQuery;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  /** Estado crudo, para comprobar en el test lo que quedó escrito. */
  tables: Required<FakeTables>;
};

/** Parte `a.eq.true,tags.ov.{x,y}` sin romper por las comas de dentro de `{}`. */
function splitOrConditions(expression: string): string[] {
  const conditions: string[] = [];
  let current = "";
  let depth = 0;

  for (const character of expression) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (character === "," && depth === 0) {
      conditions.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  if (current.length > 0) conditions.push(current);
  return conditions;
}

function matchesCondition(row: Row, condition: string): boolean {
  const [column, operator, ...rest] = condition.split(".");
  const value = rest.join(".");

  if (operator === "eq") {
    if (value === "true") return row[column] === true;
    if (value === "false") return row[column] === false;
    return String(row[column]) === value;
  }

  if (operator === "ov") {
    const wanted = value
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((entry) => entry.trim().replace(/^"|"$/g, ""))
      .filter((entry) => entry.length > 0);
    const current = row[column];
    return (
      Array.isArray(current) && wanted.some((entry) => current.includes(entry))
    );
  }

  throw new Error(`Unsupported operator in fake or(): ${operator}`);
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: { column: string; value: unknown }[] = [];
  private containsFilters: { column: string; values: string[] }[] = [];
  private orFilter: string | null = null;
  private orders: { column: string; ascending: boolean }[] = [];
  private embeds: string[] = [];
  private columns: string[] = [];
  private mode: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;

  constructor(
    private readonly store: FakeSupabase["tables"],
    private readonly table: TableName,
    private readonly userId: string,
    private readonly failSelectOn: TableName[],
  ) {}

  select(selector = "*"): FakeQuery {
    if (this.mode === "select") this.parseSelector(selector);
    return this;
  }

  insert(payload: Row): FakeQuery {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row): FakeQuery {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): FakeQuery {
    this.filters.push({ column, value });
    return this;
  }

  contains(column: string, values: string[]): FakeQuery {
    this.containsFilters.push({ column, values });
    return this;
  }

  /**
   * Soporta la forma que usa el retrieval: condiciones separadas por coma, con
   * `col.eq.valor` y `tags.ov.{a,b}` (solape de arrays).
   */
  or(expression: string): FakeQuery {
    this.orFilter = expression;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): FakeQuery {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  async maybeSingle() {
    const result = await this.run();
    if (result.error) return result;
    const rows = result.data as Row[];
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const result = await this.run();
    if (result.error) return result;
    const rows = result.data as Row[];
    if (rows.length === 0) {
      return { data: null, error: { message: "No rows found" } };
    }
    return { data: rows[0], error: null };
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: unknown;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private parseSelector(selector: string) {
    for (const [name] of Object.entries(EMBEDS)) {
      if (new RegExp(`${name}\\s*(!inner)?\\(`).test(selector)) {
        this.embeds.push(name);
      }
    }
    this.columns = selector
      .replace(/\w+\s*(!inner)?\([^)]*\)/g, "")
      .split(",")
      .map((column) => column.trim())
      .filter((column) => column.length > 0 && column !== "*");
  }

  private rows(): Row[] {
    // RLS: nunca se ve una fila de otro usuario.
    return (this.store[this.table] ?? []).filter(
      (row) => row.created_by === this.userId,
    );
  }

  private matching(): Row[] {
    let rows = this.rows();

    for (const { column, value } of this.filters) {
      rows = rows.filter((row) => row[column] === value);
    }

    for (const { column, values } of this.containsFilters) {
      rows = rows.filter((row) => {
        const current = row[column];
        return (
          Array.isArray(current) &&
          values.every((value) => current.includes(value))
        );
      });
    }

    if (this.orFilter) {
      const conditions = splitOrConditions(this.orFilter);
      rows = rows.filter((row) =>
        conditions.some((condition) => matchesCondition(row, condition)),
      );
    }

    for (const { column, ascending } of [...this.orders].reverse()) {
      rows = [...rows].sort((left, right) => {
        const a = left[column] as string | number;
        const b = right[column] as string | number;
        if (a === b) return 0;
        return (a > b ? 1 : -1) * (ascending ? 1 : -1);
      });
    }

    return rows;
  }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    if (this.mode === "insert") return this.runInsert();
    if (this.mode === "update") return this.runUpdate();

    if (this.failSelectOn.includes(this.table)) {
      return {
        data: null,
        error: { message: `select on ${this.table} failed` },
      };
    }

    const rows = this.matching().map((row) => this.project(row));
    return { data: rows, error: null };
  }

  private project(row: Row): Row {
    const projected: Row =
      this.columns.length > 0
        ? Object.fromEntries(
            this.columns
              .filter((column) => column in row)
              .map((column) => [column, row[column]]),
          )
        : { ...row };

    for (const name of this.embeds) {
      const { table, foreignKey } = EMBEDS[name];
      projected[name] = (this.store[table] ?? []).filter(
        (child) =>
          child[foreignKey] === row.id && child.created_by === this.userId,
      );
    }

    return projected;
  }

  private runInsert(): { data: unknown; error: unknown } {
    const row: Row = { ...this.payload };
    row.id ??= nextId(this.table);
    row.created_at ??= `2026-10-03T10:0${(idCounter % 9) + 1}:00.000Z`;
    row.created_by ??= this.userId;

    const parentColumn = VERSION_PARENT[this.table];
    if (parentColumn && row.version == null) {
      // El trigger: máximo del padre + 1.
      const siblings = (this.store[this.table] ?? []).filter(
        (sibling) => sibling[parentColumn] === row[parentColumn],
      );
      row.version =
        siblings.reduce(
          (max, sibling) => Math.max(max, (sibling.version as number) ?? 0),
          0,
        ) + 1;
    }

    this.store[this.table] = [...(this.store[this.table] ?? []), row];

    return { data: [this.project(row)], error: null };
  }

  private runUpdate(): { data: unknown; error: unknown } {
    if (VERSION_PARENT[this.table]) {
      // Sin política de UPDATE: una versión creada es definitiva.
      return {
        data: null,
        error: {
          message: `new row violates row-level security policy for table "${this.table}"`,
        },
      };
    }

    const targets = this.matching();
    for (const target of targets) {
      Object.assign(target, this.payload);
    }

    return { data: targets, error: null };
  }
}

export function createFakeSupabase({
  userId,
  tables = {},
  failSelectOn = [],
}: FakeSupabaseOptions): FakeSupabase {
  const store: Required<FakeTables> = {
    prompts: tables.prompts ?? [],
    prompt_versiones: tables.prompt_versiones ?? [],
    documentos_conocimiento: tables.documentos_conocimiento ?? [],
    documento_versiones: tables.documento_versiones ?? [],
  };

  return {
    tables: store,
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: TableName) =>
      new FakeQuery(store, table, userId, failSelectOn),
  };
}
