import type { Schema } from "@/lib/schema-parser";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)!;
  return out;
}

async function gzip(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) return data;
  const stream = new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CS("gzip")));
  return new Uint8Array(await stream.arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!DS) return new TextDecoder().decode(bytes);
  const stream = new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(new DS("gzip")),
  );
  return await stream.text();
}

/** Minified wire format so shared URLs stay short. */
function pack(schema: Schema) {
  return {
    t: schema.tables.map((t) => ({
      n: t.name,
      c: t.columns.map((c) => [
        c.name,
        c.type,
        (c.nullable ? 1 : 0) | (c.primary ? 2 : 0) | (c.unique ? 4 : 0),
        c.fk ? `${c.fk.table}.${c.fk.column}` : "",
      ]),
    })),
    r: schema.relations.map((r) => [r.fromTable, r.fromColumn, r.toTable, r.toColumn]),
  };
}

function unpack(raw: ReturnType<typeof pack>): Schema {
  return {
    tables: raw.t.map((t) => ({
      name: t.n,
      columns: t.c.map((c) => {
        const flags = Number(c[2]);
        const ref = String(c[3] ?? "");
        const [table, column] = ref ? ref.split(".") : [];
        return {
          name: String(c[0]),
          type: String(c[1]),
          nullable: (flags & 1) !== 0,
          primary: (flags & 2) !== 0,
          unique: (flags & 4) !== 0,
          fk: table ? { table, column: column ?? "id" } : undefined,
        };
      }),
    })),
    relations: raw.r.map((r) => ({
      fromTable: String(r[0]),
      fromColumn: String(r[1]),
      toTable: String(r[2]),
      toColumn: String(r[3]),
    })),
  };
}

export async function encodeSchema(schema: Schema): Promise<string> {
  return toBase64Url(await gzip(JSON.stringify(pack(schema))));
}

export async function decodeSchema(encoded: string): Promise<Schema | null> {
  try {
    const json = await gunzip(fromBase64Url(encoded));
    const raw = JSON.parse(json);
    if (!raw?.t) return null;
    return unpack(raw);
  } catch {
    return null;
  }
}

export async function buildShareUrl(schema: Schema): Promise<string> {
  const encoded = await encodeSchema(schema);
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${encoded}`;
}

export function readHashPayload(): string | null {
  if (typeof window === "undefined") return null;
  const m = /[#&]s=([^&]+)/.exec(window.location.hash);
  return m?.[1] ?? null;
}
