// Right answer at #1, anywhere in the top 3, and a matching built-in, grouped by source and runtime hint.
export function score(queries, results) {
  const byId = new Map(queries.map(q => [q.id, q]));
  const groups = new Map();
  for (const r of results) {
    const q = byId.get(r.query);
    const good = new Set(q.good);
    const first = r.picks.findIndex(name => good.has(name));
    const builtin = Array.isArray(q.builtin) && r.platform && q.builtin.some(token => String(r.platform.builtin).includes(token));
    for (const key of [`${r.source}|${r.hint}`, `all|${r.hint}`]) {
      const g = groups.get(key) ?? { n: 0, first: 0, top3: 0, firstOrBuiltin: 0, builtinTasks: 0, builtins: 0, errors: 0 };
      g.n++; g.first += first === 0; g.top3 += first >= 0; g.firstOrBuiltin += first === 0 || Boolean(builtin); g.errors += r.error ? 1 : 0;
      if (Array.isArray(q.builtin)) { g.builtinTasks++; g.builtins += builtin ? 1 : 0; }
      groups.set(key, g);
    }
  }
  return groups;
}
