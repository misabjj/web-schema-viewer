import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Schema } from "@/lib/schema-parser";
import { Minus, Plus, Maximize2, KeyRound, Link2 } from "lucide-react";

const TABLE_WIDTH = 260;
const HEADER_H = 38;
const ROW_H = 24;
const PAD = 10;

export type Positions = Record<string, { x: number; y: number }>;

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

function tableHeight(count: number) {
  return HEADER_H + count * ROW_H + PAD;
}

export default function ErCanvas({ schema }: { schema: Schema }) {
  const [positions, setPositions] = useState<Positions>(() => layoutTables(schema));
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { type: "pan"; startX: number; startY: number; ox: number; oy: number }
    | { type: "table"; name: string; startX: number; startY: number; tx: number; ty: number }
    | null
  >(null);

  useEffect(() => {
    setPositions(layoutTables(schema));
    setOffset({ x: 0, y: 0 });
    setScale(0.9);
  }, [schema]);

  const bounds = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const t of schema.tables) {
      const p = positions[t.name];
      if (!p) continue;
      maxX = Math.max(maxX, p.x + TABLE_WIDTH);
      maxY = Math.max(maxY, p.y + tableHeight(t.columns.length));
    }
    return { w: maxX + 120, h: maxY + 120 };
  }, [positions, schema]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(0.2, s * (e.deltaY > 0 ? 0.92 : 1.08))));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const tableEl = target.closest<HTMLElement>("[data-table]");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tableEl) {
      const name = tableEl.dataset["table"]!;
      const p = positions[name]!;
      setActive(name);
      drag.current = { type: "table", name, startX: e.clientX, startY: e.clientY, tx: p.x, ty: p.y };
    } else {
      setActive(null);
      drag.current = { type: "pan", startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (d.type === "pan") {
      setOffset({ x: d.ox + dx * scale, y: d.oy + dy * scale });
    } else {
      setPositions((prev) => ({ ...prev, [d.name]: { x: d.tx + dx, y: d.ty + dy } }));
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const s = Math.min(el.clientWidth / bounds.w, el.clientHeight / bounds.h, 1.4);
    setScale(Math.max(0.15, s * 0.95));
    setOffset({ x: 0, y: 0 });
  };

  const edges = useMemo(() => {
    return schema.relations
      .map((r, i) => {
        const from = schema.tables.find((t) => t.name === r.fromTable);
        const to = schema.tables.find((t) => t.name === r.toTable);
        const fp = positions[r.fromTable];
        const tp = positions[r.toTable];
        if (!from || !to || !fp || !tp) return null;
        const fIdx = Math.max(0, from.columns.findIndex((c) => c.name === r.fromColumn));
        const tIdx = Math.max(0, to.columns.findIndex((c) => c.name === r.toColumn));
        const fy = fp.y + HEADER_H + fIdx * ROW_H + ROW_H / 2;
        const ty = tp.y + HEADER_H + tIdx * ROW_H + ROW_H / 2;
        const fromRight = tp.x + TABLE_WIDTH / 2 > fp.x + TABLE_WIDTH / 2;
        const fx = fromRight ? fp.x + TABLE_WIDTH : fp.x;
        const tx = fromRight ? tp.x : tp.x + TABLE_WIDTH;
        const c = Math.max(40, Math.abs(tx - fx) / 2);
        const d = `M ${fx} ${fy} C ${fx + (fromRight ? c : -c)} ${fy}, ${tx + (fromRight ? -c : c)} ${ty}, ${tx} ${ty}`;
        const highlighted = active === r.fromTable || active === r.toTable;
        return { id: `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}-${i}`, d, fx, fy, tx, ty, highlighted };
      })
      .filter(Boolean) as { id: string; d: string; fx: number; fy: number; tx: number; ty: number; highlighted: boolean }[];
  }, [schema, positions, active]);

  const related = useMemo(() => {
    if (!active) return new Set<string>();
    const s = new Set<string>([active]);
    for (const r of schema.relations) {
      if (r.fromTable === active) s.add(r.toTable);
      if (r.toTable === active) s.add(r.fromTable);
    }
    return s;
  }, [active, schema]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <div
        ref={containerRef}
        className="er-grid h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            width: bounds.w,
            height: bounds.h,
            position: "relative",
          }}
        >
          <svg width={bounds.w} height={bounds.h} className="pointer-events-none absolute inset-0">
            {edges.map((e) => (
              <g key={e.id} opacity={active && !e.highlighted ? 0.18 : 1}>
                <path
                  d={e.d}
                  fill="none"
                  stroke={e.highlighted ? "var(--color-accent)" : "var(--color-edge)"}
                  strokeWidth={e.highlighted ? 2 : 1.4}
                />
                <circle cx={e.fx} cy={e.fy} r={3} fill="var(--color-edge)" />
                <circle
                  cx={e.tx}
                  cy={e.ty}
                  r={4}
                  fill="none"
                  stroke={e.highlighted ? "var(--color-accent)" : "var(--color-edge)"}
                  strokeWidth={1.5}
                />
              </g>
            ))}
          </svg>

          {schema.tables.map((t) => {
            const p = positions[t.name];
            if (!p) return null;
            const dim = active !== null && !related.has(t.name);
            return (
              <div
                key={t.name}
                data-table={t.name}
                className="absolute select-none rounded-lg border border-border bg-card shadow-panel transition-opacity"
                style={{
                  left: p.x,
                  top: p.y,
                  width: TABLE_WIDTH,
                  opacity: dim ? 0.28 : 1,
                  borderColor: active === t.name ? "var(--color-accent)" : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2 rounded-t-lg bg-table-header px-3 py-2">
                  <span className="truncate font-mono text-[13px] font-semibold tracking-tight text-foreground">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t.columns.length}
                  </span>
                </div>
                <div className="pb-1">
                  {t.columns.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-1.5 px-3 font-mono text-[11px] leading-none"
                      style={{ height: ROW_H }}
                    >
                      {c.primary ? (
                        <KeyRound className="size-3 shrink-0 text-key" />
                      ) : c.fk ? (
                        <Link2 className="size-3 shrink-0 text-accent" />
                      ) : (
                        <span className="size-3 shrink-0" />
                      )}
                      <span
                        className={
                          c.primary
                            ? "truncate text-foreground"
                            : "truncate text-foreground/80"
                        }
                      >
                        {c.name}
                      </span>
                      <span className="ml-auto truncate text-[10px] text-muted-foreground">
                        {c.type.toLowerCase()}
                        {c.nullable ? "?" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1.5 shadow-panel backdrop-blur">
        <button
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-table-header hover:text-foreground"
          onClick={() => setScale((s) => Math.max(0.2, s * 0.9))}
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-12 text-center font-mono text-[11px] text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <button
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-table-header hover:text-foreground"
          onClick={() => setScale((s) => Math.min(2.5, s * 1.1))}
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <button
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-table-header hover:text-foreground"
          onClick={fit}
          aria-label="Fit to screen"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-[11px] text-muted-foreground">
        drag canvas to pan · drag a table to move · ctrl/⌘ + scroll to zoom
      </div>
    </div>
  );
}