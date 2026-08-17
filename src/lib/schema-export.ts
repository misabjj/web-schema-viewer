import type { Schema, Table } from "@/lib/schema-parser";
import { toLaravelType } from "@/lib/laravel-types";
import {
  HEADER_H,
  ROW_H,
  TABLE_WIDTH,
  tableHeight,
  type Positions,
} from "@/lib/er-layout";

export type ExportPalette = {
  bg: string;
  card: string;
  header: string;
  border: string;
  text: string;
  muted: string;
  edge: string;
  accent: string;
  key: string;
};

export const PALETTES: Record<"dark" | "light", ExportPalette> = {
  dark: {
    bg: "#1b1f26",
    card: "#282d36",
    header: "#333944",
    border: "#3d434f",
    text: "#eceef2",
    muted: "#9aa2b1",
    edge: "#7d879b",
    accent: "#4fc3d9",
    key: "#e3b341",
  },
  light: {
    bg: "#f6f7f9",
    card: "#ffffff",
    header: "#eef0f4",
    border: "#d7dbe2",
    text: "#1b1f26",
    muted: "#6b7280",
    edge: "#98a1b1",
    accent: "#0e7c93",
    key: "#a4720b",
  },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function displayType(type: string, laravel: boolean, primary: boolean) {
  return laravel ? toLaravelType(type, { primary }) : type.toLowerCase();
}

export function buildSvg(
  schema: Schema,
  positions: Positions,
  opts: { palette: ExportPalette; laravel: boolean },
): string {
  const { palette: p, laravel } = opts;
  let maxX = 0;
  let maxY = 0;
  for (const t of schema.tables) {
    const pos = positions[t.name];
    if (!pos) continue;
    maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
    maxY = Math.max(maxY, pos.y + tableHeight(t.columns.length));
  }
  const w = maxX + 60;
  const h = maxY + 60;

  const edges = schema.relations
    .map((r) => {
      const from = schema.tables.find((t) => t.name === r.fromTable);
      const to = schema.tables.find((t) => t.name === r.toTable);
      const fp = positions[r.fromTable];
      const tp = positions[r.toTable];
      if (!from || !to || !fp || !tp) return "";
      const fIdx = Math.max(0, from.columns.findIndex((c) => c.name === r.fromColumn));
      const tIdx = Math.max(0, to.columns.findIndex((c) => c.name === r.toColumn));
      const fy = fp.y + HEADER_H + fIdx * ROW_H + ROW_H / 2;
      const ty = tp.y + HEADER_H + tIdx * ROW_H + ROW_H / 2;
      const right = tp.x > fp.x;
      const fx = right ? fp.x + TABLE_WIDTH : fp.x;
      const tx = right ? tp.x : tp.x + TABLE_WIDTH;
      const c = Math.max(40, Math.abs(tx - fx) / 2);
      const d = `M ${fx} ${fy} C ${fx + (right ? c : -c)} ${fy}, ${tx + (right ? -c : c)} ${ty}, ${tx} ${ty}`;
      return `<path d="${d}" fill="none" stroke="${p.edge}" stroke-width="1.4"/><circle cx="${fx}" cy="${fy}" r="3" fill="${p.edge}"/><circle cx="${tx}" cy="${ty}" r="4" fill="none" stroke="${p.edge}" stroke-width="1.5"/>`;
    })
    .join("");

  const boxes = schema.tables
    .map((t) => {
      const pos = positions[t.name];
      if (!pos) return "";
      const th = tableHeight(t.columns.length);
      const rows = t.columns
        .map((c, i) => {
          const y = HEADER_H + i * ROW_H + ROW_H / 2 + 4;
          const marker = c.primary ? "PK" : c.fk ? "FK" : "";
          const markerColor = c.primary ? p.key : p.accent;
          return `<text x="12" y="${y}" font-size="9" font-family="monospace" fill="${markerColor}">${marker}</text><text x="34" y="${y}" font-size="11" font-family="monospace" fill="${p.text}">${esc(c.name)}</text><text x="${TABLE_WIDTH - 12}" y="${y}" text-anchor="end" font-size="10" font-family="monospace" fill="${p.muted}">${esc(displayType(c.type, laravel, c.primary))}${c.nullable ? "?" : ""}</text>`;
        })
        .join("");
      return `<g transform="translate(${pos.x},${pos.y})"><rect width="${TABLE_WIDTH}" height="${th}" rx="8" fill="${p.card}" stroke="${p.border}"/><path d="M0 8 a8 8 0 0 1 8 -8 h${TABLE_WIDTH - 16} a8 8 0 0 1 8 8 v${HEADER_H - 8} h-${TABLE_WIDTH} z" fill="${p.header}"/><text x="12" y="24" font-size="13" font-weight="600" font-family="monospace" fill="${p.text}">${esc(t.name)}</text><text x="${TABLE_WIDTH - 12}" y="24" text-anchor="end" font-size="10" font-family="monospace" fill="${p.muted}">${t.columns.length}</text>${rows}</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${p.bg}"/>${edges}${boxes}</svg>`;
}

export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not rasterise the diagram"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function toDbml(schema: Schema, laravel = false): string {
  const tables = schema.tables
    .map((t) => {
      const cols = t.columns
        .map((c) => {
          const settings: string[] = [];
          if (c.primary) settings.push("pk");
          if (c.unique && !c.primary) settings.push("unique");
          settings.push(c.nullable ? "null" : "not null");
          if (c.fk) settings.push(`ref: > ${c.fk.table}.${c.fk.column}`);
          return `  ${c.name} ${displayType(c.type, laravel, c.primary).replace(/\s+/g, "_")} [${settings.join(", ")}]`;
        })
        .join("\n");
      return `Table ${t.name} {\n${cols}\n}`;
    })
    .join("\n\n");
  return `// Generated by Schema Atlas\n\n${tables}\n`;
}

export function toMarkdownDictionary(schema: Schema, laravel = false): string {
  const head = `# Data dictionary\n\n${schema.tables.length} tables · ${schema.relations.length} relationships\n`;
  const body = schema.tables
    .map((t) => tableMarkdown(t, laravel))
    .join("\n");
  return `${head}\n${body}`;
}

export function tableMarkdown(t: Table, laravel = false): string {
  const rows = t.columns
    .map(
      (c) =>
        `| ${c.name} | ${displayType(c.type, laravel, c.primary)} | ${c.nullable ? "yes" : "no"} | ${c.primary ? "PK" : c.unique ? "unique" : ""} | ${c.fk ? `${c.fk.table}.${c.fk.column}` : ""} |`,
    )
    .join("\n");
  return `## ${t.name}\n\n| Column | Type | Nullable | Key | References |\n| --- | --- | --- | --- | --- |\n${rows}\n`;
}

export function tableCsv(t: Table, laravel = false): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = t.columns.map((c) =>
    [
      t.name,
      c.name,
      displayType(c.type, laravel, c.primary),
      c.nullable ? "yes" : "no",
      c.primary ? "yes" : "no",
      c.unique ? "yes" : "no",
      c.fk ? `${c.fk.table}.${c.fk.column}` : "",
    ]
      .map(q)
      .join(","),
  );
  return ["table,column,type,nullable,primary,unique,references", ...rows].join("\n");
}

export function download(filename: string, data: Blob | string, mime = "text/plain") {
  const blob = typeof data === "string" ? new Blob([data], { type: `${mime};charset=utf-8` }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
