import { useRef, useState } from "react";
import { Upload, FileCode2, Sparkles } from "lucide-react";

const SAMPLE = `CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  email_verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
);

CREATE TABLE teams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT teams_owner_fk FOREIGN KEY (owner_id) REFERENCES users (id)
);

CREATE TABLE posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  team_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  published_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT posts_team_fk FOREIGN KEY (team_id) REFERENCES teams (id)
);

CREATE TABLE comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT comments_post_fk FOREIGN KEY (post_id) REFERENCES posts (id),
  CONSTRAINT comments_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE post_tag (
  post_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT post_tag_post_fk FOREIGN KEY (post_id) REFERENCES posts (id),
  CONSTRAINT post_tag_tag_fk FOREIGN KEY (tag_id) REFERENCES tags (id)
);`;

export default function SchemaUploader({
  onLoad,
  error,
}: {
  onLoad: (text: string) => void;
  error?: string | null;
}) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    const content = await file.text();
    setText(content);
    onLoad(content);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Sparkles className="size-3 text-primary" /> structure only · never data
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground">
          Your database, mapped.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Drop a schema dump and get a scrollable, zoomable ER diagram of your real tables,
          keys and relationships. Everything is parsed in your browser — no rows, no uploads,
          nothing leaves this page.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void readFile(file);
        }}
        className="rounded-xl border-2 border-dashed p-10 text-center transition-colors"
        style={{
          borderColor: dragOver ? "var(--color-primary)" : "var(--color-border)",
          backgroundColor: dragOver ? "var(--color-secondary)" : "transparent",
        }}
      >
        <Upload className="mx-auto size-7 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Drop your .sql or .json structure file</p>
        <p className="mt-1 text-xs text-muted-foreground">
          mysqldump --no-data · pg_dump --schema-only · SQLite · JSON export
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <FileCode2 className="size-4" /> Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".sql,.txt,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
      </div>

      <div className="mt-8">
        <label
          htmlFor="schema-sql"
          className="mb-2 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
        >
          or paste your schema
        </label>
        <textarea
          id="schema-sql"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder="CREATE TABLE users (&#10;  id BIGINT PRIMARY KEY,&#10;  ...&#10;);"
          className="h-56 w-full resize-y rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary"
        />
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => onLoad(text)}
            disabled={!text.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Render diagram
          </button>
          <button
            onClick={() => {
              setText(SAMPLE);
              onLoad(SAMPLE);
            }}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Try a sample schema
          </button>
        </div>
      </div>
    </div>
  );
}