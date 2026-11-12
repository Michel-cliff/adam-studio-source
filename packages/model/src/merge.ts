export type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursive merge of plain objects; arrays and scalars from `patch` replace those in `base`. */
export function deepMerge(base: Plain, patch: Plain): Plain {
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    const current = Object.hasOwn(out, k) ? out[k] : undefined;
    out[k] = isPlain(v) ? deepMerge(isPlain(current) ? current : {}, v) : v;
  }
  return out;
}
