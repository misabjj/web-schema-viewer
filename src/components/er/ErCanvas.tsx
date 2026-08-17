import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Schema, Table } from "@/lib/schema-parser";
import { Minus, Plus, Maximize2, KeyRound, Link2, Crosshair, Copy, Download } from "lucide-react";
import {
  HEADER_H,
  ROW_H,
  TABLE_WIDTH,
  layoutTables,
  tableHeight,
  type Positions,
} from "@/lib/er-layout";
import { displayType, download, tableCsv, tableMarkdown } from "@/lib/schema-export";

export type CanvasExport = { positions: Positions };

export default function ErCanvas({
  schema,
  laravelTypes,
  onFocus,
  onPositions,
}: {
  schema: Schema;
  laravelTypes: boolean;
  onFocus: (table: string) => void;
  onPositions?: (p: Positions) => void;
}) {
  const [positions, setPositions] = useState<Positions>(() => layoutTables(schema));
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ table: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const drag = useRef<
    | { type: "pan"; startX: number; startY: number; ox: number; oy: number }
    | { type: "table"; name: string; startX: number; startY: number; tx: number; ty: number }
    | null
  >(null);

  useEffect(() => {
    const next = layoutTables(schema);
    setPositions(next);
    setOffset({ x: 0, y: 0 });
    setScale(0.9);
    setMenu(null);
  }, [schema]);

  useEffect(() => {
    onPositions?.(positions);
  }, [positions, onPositions]);

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
    if (target.closest("[data-menu]")) return;
    const tableEl = target.closest<HTMLElement>("[data-table]");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moved.current = false;
    setMenu(null);
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
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    if (d.type === "pan") {
      setOffset({ x: d.ox + dx * scale, y: d.oy + dy * scale });
    } else {
      setPositions((prev) => ({ ...prev, [d.name]: { x: d.tx + dx, y: d.ty + dy } }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.type !== "table" || moved.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ table: d.name, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const s = Math.min(el.clientWidth / bounds.w, el.clientHeight / bounds.h, 1.4);
    setScale(Math.max(0.15, s * 0.95));
    setOffset({ x: 0, y: 0 });
  }, [bounds]);

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

  const menuTable: Table | undefined = menu
    ? schema.tables.find((t) => t.name === menu.table)
    : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <div
        ref={containerRef}
        className="er-grid h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
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
                        className={c.primary ? "truncate text-foreground" : "truncate text-foreground/80"}
                      >
                        {c.name}
                      </span>
                      <span className="ml-auto truncate text-[10px] text-muted-foreground">
                        {displayType(c.type, laravelTypes, c.primary)}
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

      {menu && menuTable ? (
        <div
          data-menu
          className="absolute z-20 w-52 overflow-hidden rounded-lg border border-border bg-popover shadow-panel"
          style={{ left: Math.min(menu.x, (containerRef.current?.clientWidth ?? 0) - 220), top: menu.y }}
        >
          <div className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {menuTable.name}
          </div>
          <MenuItem
            icon={<Crosshair className="size-3.5" />}
            label="Focus this table"
            onClick={() => {
              onFocus(menuTable.name);
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Copy className="size-3.5" />}
            label="Copy JSON"
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(menuTable, null, 2));
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Download className="size-3.5" />}
            label="Download JSON"
            onClick={() => {
              download(`${menuTable.name}.json`, JSON.stringify(menuTable, null, 2), "application/json");
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Download className="size-3.5" />}
            label="Download CSV"
            onClick={() => {
              download(`${menuTable.name}.csv`, tableCsv(menuTable, laravelTypes), "text/csv");
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Download className="size-3.5" />}
            label="Download Markdown"
            onClick={() => {
              download(`${menuTable.name}.md`, tableMarkdown(menuTable, laravelTypes), "text/markdown");
              setMenu(null);
            }}
          />
        </div>
      ) : null}

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
        drag to pan · click a table for actions · ctrl/⌘ + scroll to zoom
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-table-header"
    >
      {icon}
      {label}
    </button>
  );
}
