import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Database, RotateCcw, Search } from "lucide-react";
import ErCanvas from "@/components/er/ErCanvas";
import SchemaUploader from "@/components/er/SchemaUploader";
import { parseSchema, type Schema } from "@/lib/schema-parser";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Schema Atlas — Interactive ER Diagram of Your Database" },
      {
        name: "description",
        content:
          "Upload a SQL or JSON structure dump and explore a scrollable, zoomable ER diagram of your real schema. Structure only — your data never leaves the browser.",
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

  const handleLoad = (text: string) => {
    const parsed = parseSchema(text);
    if (!parsed.tables.length) {
      setError("No CREATE TABLE statements found. Export structure only (no data) and try again.");
      return;
    }
    setError(null);
    setSchema(parsed);
  };

  const filtered = useMemo(() => {
    if (!schema) return null;
    const q = query.trim().toLowerCase();
    if (!q) return schema;
    const tables = schema.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    );
    const names = new Set(tables.map((t) => t.name));
    return {
      tables,
      relations: schema.relations.filter((r) => names.has(r.fromTable) && names.has(r.toTable)),
    };
  }, [schema, query]);

  if (!schema || !filtered) {
    return (
      <main className="min-h-screen bg-background">
        <SchemaUploader onLoad={handleLoad} error={error} />
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <span className="font-mono text-sm font-semibold tracking-tight">Schema Atlas</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span>{schema.tables.length} tables</span>
          <span className="opacity-40">/</span>
          <span>{schema.relations.length} relations</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tables or columns"
              className="w-56 rounded-md border border-border bg-card py-1.5 pl-8 pr-3 font-mono text-xs text-foreground outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={() => {
              setSchema(null);
              setQuery("");
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> New schema
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ErCanvas schema={filtered} />
      </div>
    </main>
  );
}
