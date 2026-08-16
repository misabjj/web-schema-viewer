/** Map a raw SQL column type to its closest Laravel migration method. */
export function toLaravelType(sqlType: string, opts?: { primary?: boolean }): string {
  const t = sqlType.toLowerCase().trim();
  const size = /\(\s*(\d+)/.exec(t)?.[1];
  const has = (s: string) => t.includes(s);

  if (opts?.primary && (has("bigint") || has("serial") || has("int"))) return "id()";
  if (has("bigserial") || has("bigint")) return "bigInteger";
  if (has("smallint") || has("int2")) return "smallInteger";
  if (has("tinyint(1)") || has("bool")) return "boolean";
  if (has("tinyint")) return "tinyInteger";
  if (has("mediumint")) return "mediumInteger";
  if (has("serial") || has("integer") || has("int")) return "integer";
  if (has("uuid")) return "uuid";
  if (has("jsonb")) return "jsonb";
  if (has("json")) return "json";
  if (has("longtext")) return "longText";
  if (has("mediumtext")) return "mediumText";
  if (has("text")) return "text";
  if (has("varchar") || has("character varying") || has("nvarchar"))
    return size ? `string(${size})` : "string";
  if (has("char")) return `char(${size ?? 255})`;
  if (has("enum")) return "enum";
  if (has("decimal") || has("numeric")) return "decimal";
  if (has("float") || has("real")) return "float";
  if (has("double")) return "double";
  if (has("timestamptz") || has("timestamp with")) return "timestampTz";
  if (has("timestamp") || has("datetime")) return "timestamp";
  if (has("date")) return "date";
  if (has("time")) return "time";
  if (has("year")) return "year";
  if (has("binary") || has("blob") || has("bytea")) return "binary";
  if (has("inet")) return "ipAddress";
  if (has("macaddr")) return "macAddress";
  return t || "string";
}
