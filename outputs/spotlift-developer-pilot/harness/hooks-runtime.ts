/**
 * Minimal synchronous React-hooks runtime for isolated pilot testing.
 *
 * Models only the semantics this pilot depends on: per-instance hook slots in
 * call order, `useState` identity/update, `useCallback` dep memoisation, and
 * `useRef` persistence across renders. Re-render is synchronous on setState,
 * which is deterministic and sufficient because every setState in the code
 * under test happens from an async continuation, never during render.
 *
 * This is NOT React. It does not model batching, concurrent rendering,
 * StrictMode double-invocation, or unmount. See README.md "Limitations".
 */

type Slot = { value: unknown };

export type Snapshot<T> = { render: number; value: T };

class Instance<T> {
  slots: Slot[] = [];
  cursor = 0;
  renders = 0;
  snapshots: Snapshot<T>[] = [];
  private readonly body: () => T;

  constructor(body: () => T) {
    this.body = body;
  }

  render(): T {
    const previous = active;
    active = this as Instance<unknown>;
    this.cursor = 0;
    let value: T;
    try {
      value = this.body();
    } finally {
      active = previous;
    }
    this.renders += 1;
    this.snapshots.push({ render: this.renders, value });
    return value;
  }

  get current(): T {
    return this.snapshots[this.snapshots.length - 1].value;
  }
}

let active: Instance<unknown> | null = null;

function slot(): Slot {
  if (!active) throw new Error("hook called outside render()");
  const index = active.cursor++;
  if (index >= active.slots.length) active.slots.push({ value: undefined });
  return active.slots[index];
}

export function useState<S>(initial: S): [S, (next: S | ((prev: S) => S)) => void] {
  const cell = slot();
  const instance = active as Instance<unknown>;
  if (cell.value === undefined) {
    cell.value = {
      state: initial,
      setState: (next: S | ((prev: S) => S)) => {
        const holder = cell.value as { state: S };
        const resolved =
          typeof next === "function" ? (next as (prev: S) => S)(holder.state) : next;
        if (Object.is(resolved, holder.state)) return;
        holder.state = resolved;
        instance.render();
      },
    };
  }
  const holder = cell.value as { state: S; setState: (next: S | ((prev: S) => S)) => void };
  return [holder.state, holder.setState];
}

export function useRef<S>(initial: S): { current: S } {
  const cell = slot();
  if (cell.value === undefined) cell.value = { current: initial };
  return cell.value as { current: S };
}

export function useCallback<F extends (...args: never[]) => unknown>(fn: F, deps: unknown[]): F {
  const cell = slot();
  const previous = cell.value as { fn: F; deps: unknown[] } | undefined;
  if (
    previous &&
    previous.deps.length === deps.length &&
    previous.deps.every((dep, i) => Object.is(dep, deps[i]))
  ) {
    return previous.fn;
  }
  cell.value = { fn, deps };
  return fn;
}

/** Mount a hook body and return a handle exposing its latest render output. */
export function mount<T>(body: () => T): Instance<T> {
  const instance = new Instance<T>(body);
  instance.render();
  return instance;
}
