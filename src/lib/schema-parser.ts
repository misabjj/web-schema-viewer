export type Column = {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  unique: boolean;
  fk?: { table: string; column: string };
};

export type Table = {
  name: string;
  columns: Column[];
};

export type Relation = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type Schema = {
  tables: Table[];
  relations: Relation[];
};

const clean = (s: string) => s.trim().replace(/^[`"'[]|[`"'\]]$/g, "");

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function matchBalanced(sql: string, openIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < sql.length; i++) {
    const ch = sql[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  return sql.slice(openIndex + 1);
}

const IDENT = "[`\"\\[]?([A-Za-z0-9_$.]+)[`\"\\]]?";

/** Parse a SQL structure dump (MySQL / PostgreSQL / SQLite / SQL Server flavours). */
export function parseSqlSchema(input: string): Schema {
  // strip comments
  const sql = input
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--.*$/gm, " ")
    .replace(/^\s*#.*$/gm, " ");

  const tables: Table[] = [];
  const relations: Relation[] = [];
  const byName = new Map<string, Table>();

  const createRe = new RegExp(
    `CREATE\\s+(?:GLOBAL\\s+|LOCAL\\s+|TEMP(?:ORARY)?\\s+|UNLOGGED\\s+)*TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}\\s*\\(`,
    "gi",
  );

  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sql))) {
    const rawName = clean(m[1] ?? "");
    const name = rawName.includes(".") ? rawName.split(".").pop()! : rawName;
    const body = matchBalanced(sql, createRe.lastIndex - 1);
    const table: Table = { name, columns: [] };

    for (const part of splitTopLevel(body)) {
      const upper = part.toUpperCase();

      const pkMatch = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(part);
      if (pkMatch) {
        const cols = pkMatch[1]!.split(",").map((c) => clean(c.split(/\s/)[0] ?? ""));
        for (const c of cols) {
          const col = table.columns.find((x) => x.name === c);
          if (col) col.primary = true;
        }
        continue;
      }

      const uqMatch = /^(?:CONSTRAINT\s+\S+\s+)?UNIQUE(?:\s+KEY|\s+INDEX)?[^(]*\(([^)]*)\)/i.exec(part);
      if (uqMatch && /^\s*(CONSTRAINT|UNIQUE)/i.test(part)) {
        const cols = uqMatch[1]!.split(",").map((c) => clean(c.split(/\s/)[0] ?? ""));
        for (const c of cols) {
          const col = table.columns.find((x) => x.name === c);
          if (col) col.unique = true;
        }
        continue;
      }

      const fkMatch = new RegExp(
        `FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+${IDENT}\\s*\\(([^)]*)\\)`,
        "i",
      ).exec(part);
      if (fkMatch) {
        const fromCols = fkMatch[1]!.split(",").map((c) => clean(c));
        const target = clean(fkMatch[2] ?? "");
        const toCols = fkMatch[3]!.split(",").map((c) => clean(c));
        fromCols.forEach((fc, i) => {
          const toTable = target.includes(".") ? target.split(".").pop()! : target;
          const toColumn = toCols[i] ?? toCols[0] ?? "id";
          relations.push({ fromTable: name, fromColumn: fc, toTable, toColumn });
          const col = table.columns.find((x) => x.name === fc);
          if (col) col.fk = { table: toTable, column: toColumn };
        });
        continue;
      }

      if (/^(KEY|INDEX|CONSTRAINT|CHECK|FULLTEXT|SPATIAL|EXCLUDE|PERIOD)\b/i.test(upper)) continue;

      // column definition
      const colMatch = new RegExp(`^${IDENT}\\s+(.+)$`, "s").exec(part);
      if (!colMatch) continue;
      const colName = clean(colMatch[1] ?? "");
      const rest = (colMatch[2] ?? "").trim();
      const typeMatch = /^([A-Za-z_][A-Za-z0-9_ ]*(?:\([^)]*\))?(?:\s*\[\])?)/.exec(rest);
      let type = (typeMatch?.[1] ?? rest).trim();
      type = type.replace(/\s+(NOT|NULL|DEFAULT|PRIMARY|UNIQUE|REFERENCES|GENERATED|AUTO_INCREMENT|COMMENT|CHECK|COLLATE|CHARACTER)$/i, "");

      const col: Column = {
        name: colName,
        type: type || "unknown",
        nullable: !/\bNOT\s+NULL\b/i.test(rest) && !/\bPRIMARY\s+KEY\b/i.test(rest),
        primary: /\bPRIMARY\s+KEY\b/i.test(rest) || /\bSERIAL\s+PRIMARY/i.test(rest),
        unique: /\bUNIQUE\b/i.test(rest),
      };

      const inlineRef = new RegExp(`REFERENCES\\s+${IDENT}\\s*(?:\\(([^)]*)\\))?`, "i").exec(rest);
      if (inlineRef) {
        const target = clean(inlineRef[1] ?? "");
        const toTable = target.includes(".") ? target.split(".").pop()! : target;
        const toColumn = clean((inlineRef[2] ?? "id").split(",")[0] ?? "id");
        col.fk = { table: toTable, column: toColumn };
        relations.push({ fromTable: name, fromColumn: colName, toTable, toColumn });
      }

      table.columns.push(col);
    }

    tables.push(table);
    byName.set(name.toLowerCase(), table);
  }

  // ALTER TABLE ... ADD [CONSTRAINT x] FOREIGN KEY (...) REFERENCES y (...)
  const alterRe = new RegExp(
    `ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${IDENT}[\\s\\S]*?FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+${IDENT}\\s*\\(([^)]*)\\)`,
    "gi",
  );
  while ((m = alterRe.exec(sql))) {
    const rawFrom = clean(m[1] ?? "");
    const fromTable = rawFrom.includes(".") ? rawFrom.split(".").pop()! : rawFrom;
    const fromCols = m[2]!.split(",").map((c) => clean(c));
    const rawTo = clean(m[3] ?? "");
    const toTable = rawTo.includes(".") ? rawTo.split(".").pop()! : rawTo;
    const toCols = m[4]!.split(",").map((c) => clean(c));
    fromCols.forEach((fc, i) => {
      const toColumn = toCols[i] ?? toCols[0] ?? "id";
      if (relations.some((r) => r.fromTable === fromTable && r.fromColumn === fc)) return;
      relations.push({ fromTable, fromColumn: fc, toTable, toColumn });
      const t = byName.get(fromTable.toLowerCase());
      const col = t?.columns.find((x) => x.name === fc);
      if (col) col.fk = { table: toTable, column: toColumn };
    });
  }

  // Infer conventional Laravel relations (user_id -> users.id) when no FK constraints exist
  if (relations.length === 0) {
    for (const t of tables) {
      for (const c of t.columns) {
        const conv = /^(.+)_id$/.exec(c.name);
        if (!conv) continue;
        const base = conv[1]!;
        const guesses = [base + "s", base, base + "es", base.replace(/y$/, "ies")];
        const target = guesses.map((g) => byName.get(g.toLowerCase())).find(Boolean);
        if (target && target.name !== t.name) {
          c.fk = { table: target.name, column: "id" };
          relations.push({
            fromTable: t.name,
            fromColumn: c.name,
            toTable: target.name,
            toColumn: "id",
          });
        }
      }
    }
  }

  return { tables, relations: relations.filter((r) => byName.has(r.toTable.toLowerCase())) };
}

/** Accepts a JSON schema export: { tables: [{ name, columns: [...] }] } */
export function parseJsonSchema(input: string): Schema | null {
  try {
    const data = JSON.parse(input);
    const rawTables = Array.isArray(data) ? data : data.tables;
    if (!Array.isArray(rawTables)) return null;
    const tables: Table[] = rawTables.map((t: Record<string, unknown>) => ({
      name: String(t["name"] ?? t["table"] ?? "table"),
      columns: ((t["columns"] ?? []) as Record<string, unknown>[]).map((c) => ({
        name: String(c["name"] ?? c["column"] ?? "col"),
        type: String(c["type"] ?? "unknown"),
        nullable: Boolean(c["nullable"] ?? true),
        primary: Boolean(c["primary"] ?? c["primary_key"] ?? false),
        unique: Boolean(c["unique"] ?? false),
        fk: c["references"]
          ? {
              table: String((c["references"] as Record<string, unknown>)["table"] ?? ""),
              column: String((c["references"] as Record<string, unknown>)["column"] ?? "id"),
            }
          : undefined,
      })),
    }));
    const relations: Relation[] = [];
    for (const t of tables)
      for (const c of t.columns)
        if (c.fk?.table)
          relations.push({
            fromTable: t.name,
            fromColumn: c.name,
            toTable: c.fk.table,
            toColumn: c.fk.column,
          });
    return { tables, relations };
  } catch {
    return null;
  }
}

export function parseSchema(input: string): Schema {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = parseJsonSchema(trimmed);
    if (json && json.tables.length) return json;
  }
  return parseSqlSchema(trimmed);
}