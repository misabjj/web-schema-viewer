import type { Schema } from "@/lib/schema-parser";

export const TABLE_WIDTH = 260;
export const HEADER_H = 38;
export const ROW_H = 24;
export const PAD = 10;

export type Positions = Record<string, { x: number; y: number }>;

export function tableHeight(count: number) {
  return HEADER_H + count * ROW_H + PAD;
}

export function layoutTables(schema: Schema): Positions {
  const deg = new Map<string, number>();
  for (const t of schema.tables) deg.set(t.name, 0);
  for (const r of schema.relations) {
    deg.set(r.fromTable, (deg.get(r.fromTable) ?? 0) + 1);
    deg.set(r.toTable, (deg.get(r.toTable) ?? 0) + 1);
  }
  const sorted = [...schema.tables].sort(
    (a, b) => (deg.get(b.name) ?? 0) - (deg.get(a.name) ?? 0),
  );
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  const pos: Positions = {};
  const colHeights = new Array(cols).fill(60);
  sorted.forEach((t, i) => {
    const c = i % cols;
    const h = HEADER_H + t.columns.length * ROW_H + PAD * 2;
    pos[t.name] = { x: 60 + c * (TABLE_WIDTH + 90), y: colHeights[c] };
    colHeights[c] += h + 70;
  });
  return pos;
}

/** Tables reachable from `root` within `depth` relation hops. */
export function withinDepth(schema: Schema, root: string, depth: number): Set<string> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const r of schema.relations) {
    add(r.fromTable, r.toTable);
    add(r.toTable, r.fromTable);
  }
  const seen = new Set([root]);
  let frontier = [root];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const n of frontier)
      for (const m of adj.get(n) ?? [])
        if (!seen.has(m)) {
          seen.add(m);
          next.push(m);
        }
    frontier = next;
  }
  return seen;
}

/** Group name derived from a table prefix, e.g. shop_orders -> shop. */
export function moduleOf(name: string): string {
  const i = name.indexOf("_");
  return i > 0 ? name.slice(0, i) : "main";
}

export function modulesOf(schema: Schema): string[] {
  const counts = new Map<string, number>();
  for (const t of schema.tables) {
    const m = moduleOf(t.name);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([m]) => m)
    .sort();
}
