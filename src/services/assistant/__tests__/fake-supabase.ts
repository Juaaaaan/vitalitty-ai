import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/**
 * Cliente de Supabase falso con lo justo para las herramientas: filtra en
 * memoria las tablas que se le pasan.
 *
 * No imita la RLS: una tabla aquí ya son "las filas del usuario". Lo que se
 * comprueba con él es la forma de la consulta y del resultado; el aislamiento
 * entre usuarios lo garantiza la base de datos, no este doble.
 */
export function fakeSupabase(
  tables: Record<string, Row[]>,
  inserts: Array<{ table: string; values: Row }> = [],
) {
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    let limited: number | undefined;

    const api = {
      select: (columns?: string) => {
        // Join anidado tipo `patients(...)`: se resuelve por la clave foránea
        // obvia, que es lo único que usan las herramientas.
        const nested = columns?.match(/(\w+)\(/g) ?? [];
        for (const match of nested) {
          const relation = match.slice(0, -1);
          // Si la fila ya trae la relación puesta a mano, se respeta: es la
          // forma cómoda de fijar un join en una prueba.
          if (relation === table || !(relation in tables)) continue;
          if (rows.every((row) => relation in row)) continue;
          rows = rows.map((row) => ({
            ...row,
            [relation]: (tables[relation] ?? []).filter(
              (related) => related[`${table.replace(/s$/, "")}_id`] === row.id,
            ),
          }));
        }
        return api;
      },
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return api;
      },
      lt: (column: string, value: string | number) => {
        rows = rows.filter((row) => (row[column] as string | number) < value);
        return api;
      },
      gte: (column: string, value: string | number) => {
        rows = rows.filter((row) => (row[column] as string | number) >= value);
        return api;
      },
      not: (column: string) => {
        rows = rows.filter((row) => row[column] != null);
        return api;
      },
      or: (expression: string) => {
        // "col.ilike.%texto%,otra.ilike.%texto%"
        const clauses = expression.split(",").map((clause) => {
          const [column, , pattern] = clause.split(".");
          return { column, needle: pattern.replaceAll("%", "").toLowerCase() };
        });
        rows = rows.filter((row) =>
          clauses.some(({ column, needle }) =>
            String(row[column] ?? "")
              .toLowerCase()
              .includes(needle),
          ),
        );
        return api;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        const direction = options?.ascending === false ? -1 : 1;
        rows.sort((a, b) =>
          String(a[column]) > String(b[column]) ? direction : -direction,
        );
        return api;
      },
      limit: (count: number) => {
        limited = count;
        return api;
      },
      insert: (values: Row) => {
        // El trigger de base de datos asigna la versión: aquí se imita con el
        // número de dietas que ya tiene ese paciente.
        const versions = (tables[table] ?? []).filter(
          (row) =>
            row.patient_id === values.patient_id && row.diet_version != null,
        ).length;
        const inserted = {
          id: `new-${(tables[table] ?? []).length + 1}`,
          diet_version: values.diet_md ? versions + 1 : null,
          ...values,
        };
        (tables[table] ??= []).push(inserted);
        inserts.push({ table, values });
        rows = [inserted];
        return api;
      },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      update: (values: Row) => {
        rows.forEach((row) => Object.assign(row, values));
        return api;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
        resolve({
          data: limited == null ? rows : rows.slice(0, limited),
          error: null,
        }),
    };

    return api;
  }

  return {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://storage/signed/${path}?token=muy-largo` },
          error: null,
        }),
        upload: async () => ({ error: null }),
      }),
    },
  } as unknown as SupabaseClient;
}
