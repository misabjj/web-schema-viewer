import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Database,
  Download,
  Github,
  Link as LinkIcon,
  Moon,
  RotateCcw,
  Search,
  Sun,
} from "lucide-react";
import ErCanvas from "@/components/er/ErCanvas";
import SchemaUploader from "@/components/er/SchemaUploader";
import { parseSchema, type Schema } from "@/lib/schema-parser";
import { layoutTables, moduleOf, modulesOf, withinDepth, type Positions } from "@/lib/er-layout";
import {
  PALETTES,
  buildSvg,
  download,
  svgToPngBlob,
  toDbml,
  toMarkdownDictionary,
} from "@/lib/schema-export";
import { buildShareUrl, decodeSchema, readHashPayload } from "@/lib/share";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Schema Atlas — Interactive ER Diagram of Your Database" },
      {
        name: "description",
        content:
          "Upload a SQL or JSON structure dump and explore a scrollable, zoomable ER diagram of your real schema. Share it as a link, export PNG, SVG, DBML or a Markdown data dictionary.",
      },
      { property: "og:title", content: "Schema Atlas — Interactive ER Diagram" },
      {
        property: "og:description",
        content:
          "Drop a schema dump and get a zoomable ER diagram of tables, keys and relationships. Structure only, never data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("");
  const [depth, setDepth] = useState(1);
  const [laravelTypes, setLaravelTypes] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const positionsRef = useRef<Positions>({});
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const payload = readHashPayload();
    if (!payload) return;
    void decodeSchema(payload).then((s) => {
      if (s?.tables.length) setSchema(s);
    });
  }, []);

  const handleLoad = (text: string) => {
    const parsed = parseSchema(text);
    if (!parsed.tables.length) {
      setError("No CREATE TABLE statements found. Export structure only (no data) and try again.");
      return;
    }
    setError(null);
    setFocus("");
    setModuleFilter("all");
    setSchema(parsed);
  };

  const modules = useMemo(() => (schema ? modulesOf(schema) : []), [schema]);

  const filtered = useMemo(() => {
    if (!schema) return null;
    let tables = schema.tables;

    if (moduleFilter !== "all")
      tables = tables.filter((t) => moduleOf(t.name) === moduleFilter);

    if (focus) {
      const keep = withinDepth(schema, focus, depth);
      tables = tables.filter((t) => keep.has(t.name) || t.name === focus);
    }

    const q = query.trim().toLowerCase();
    if (q)
      tables = tables.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.columns.some((c) => c.name.toLowerCase().includes(q)),
      );

    const names = new Set(tables.map((t) => t.name));
    return {
      tables,
      relations: schema.relations.filter((r) => names.has(r.fromTable) && names.has(r.toTable)),
    };
  }, [schema, query, focus, depth, moduleFilter]);

  const onPositions = useCallback((p: Positions) => {
    positionsRef.current = p;
  }, []);

  const currentPositions = useCallback(
    (view: Schema) =>
      Object.keys(positionsRef.current).length ? positionsRef.current : layoutTables(view),
    [],
  );

  const share = async () => {
    if (!schema) return;
    const url = await buildShareUrl(schema);
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be blocked; the URL bar still holds the link */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doExport = async (kind: "png" | "svg" | "md" | "dbml") => {
    if (!filtered) return;
    setExportOpen(false);
    if (kind === "md") return download("data-dictionary.md", toMarkdownDictionary(filtered, laravelTypes), "text/markdown");
    if (kind === "dbml") return download("schema.dbml", toDbml(filtered, laravelTypes), "text/plain");
    const svg = buildSvg(filtered, currentPositions(filtered), {
      palette: PALETTES[theme],
      laravel: laravelTypes,
    });
    if (kind === "svg") return download("schema.svg", svg, "image/svg+xml");
    download("schema.png", await svgToPngBlob(svg));
  };

  if (!schema || !filtered) {
    return (
      <main className="min-h-screen bg-background">
        <SchemaUploader onLoad={handleLoad} error={error} theme={theme} onToggleTheme={toggle} />
      </main>
    );
  }

  const control =
    "rounded-md border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary";

  return (
    <main className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <span className="font-mono text-sm font-semibold tracking-tight">Schema Atlas</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span>{filtered.tables.length}/{schema.tables.length} tables</span>
          <span className="opacity-40">/</span>
          <span>{filtered.relations.length} relations</span>
        </div>

        <select
          aria-label="Connection or module"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className={control}
        >
          <option value="all">main connection · all tables</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              module · {m}
            </option>
          ))}
        </select>

        <select
          aria-label="Focus table"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className={control}
        >
          <option value="">no focus</option>
          {schema.tables.map((t) => (
            <option key={t.name} value={t.name}>
              focus · {t.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          depth
          <input
            type="number"
            min={1}
            max={6}
            value={depth}
            onChange={(e) => setDepth(Math.min(6, Math.max(1, Number(e.target.value) || 1)))}
            disabled={!focus}
            className={`${control} w-14 disabled:opacity-40`}
          />
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={laravelTypes}
            onChange={(e) => setLaravelTypes(e.target.checked)}
            className="size-3.5 accent-[var(--color-primary)]"
          />
          Laravel types
        </label>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tables or columns"
              className="w-48 rounded-md border border-border bg-card py-1.5 pl-8 pr-3 font-mono text-xs text-foreground outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={() => void share()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="size-3.5 text-accent" /> : <LinkIcon className="size-3.5" />}
            {copied ? "Link copied" : "Share link"}
          </button>

          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="size-3.5" /> Export
            </button>
            {exportOpen ? (
              <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-panel">
                {[
                  ["png", "PNG image"],
                  ["svg", "SVG vector"],
                  ["md", "Data dictionary (Markdown)"],
                  ["dbml", "DBML"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => void doExport(k as "png" | "svg" | "md" | "dbml")}
                    className="block w-full px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-table-header"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            onClick={toggle}
            aria-label="Toggle colour theme"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </button>

          <button
            onClick={() => {
              setSchema(null);
              setQuery("");
              setFocus("");
              window.history.replaceState(null, "", window.location.pathname);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> New schema
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ErCanvas
          schema={filtered}
          laravelTypes={laravelTypes}
          onFocus={setFocus}
          onPositions={onPositions}
        />
      </div>

      <footer className="shrink-0 border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
        Structure only, never data · inspired by{" "}
        <a
          href="https://github.com/albertoarena/laravel-truss"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
        >
          <Github className="size-3" /> albertoarena/laravel-truss
        </a>
      </footer>
    </main>
  );
}
