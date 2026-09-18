/**
 * Minimal stand-in for the Drizzle D1 client used by subscriber code. There is
 * no in-memory D1 equivalent to Turso's `:memory:` trick, so tests swap the
 * `d1` export of `db/d1-client.js` for this object via `vi.mock` and assert on
 * `d1State`. Only the chains the app actually uses are implemented.
 */
export const d1State = {
  /** Rows returned, in order, by successive `.select().from().where().get()` calls. */
  rows: [] as unknown[],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  /** Rows returned by `.select().from().where()` / `.all()` (list queries). */
  lists: [] as unknown[][],
};

export function resetD1(rows: unknown[] = [], lists: unknown[][] = []) {
  d1State.rows = [...rows];
  d1State.inserted = [];
  d1State.updated = [];
  d1State.lists = [...lists];
}

function listResult() {
  const list = d1State.lists.shift() ?? [];
  const thenable = {
    get: async () => d1State.rows.shift(),
    all: async () => list,
    then: (resolve: (v: unknown[]) => void) => resolve(list),
  };
  return thenable;
}

export const fakeD1 = {
  select: () => ({
    from: () => {
      const result = listResult();
      return { where: () => result, ...result };
    },
  }),
  insert: () => ({
    values: async (values: Record<string, unknown>) => {
      d1State.inserted.push(values);
    },
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        d1State.updated.push(values);
      },
    }),
  }),
};
