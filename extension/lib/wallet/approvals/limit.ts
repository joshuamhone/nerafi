// Run `task` over every item with at most `limit` in flight, keeping result
// order. A rejection is recorded for that item only; the others carry on.
export async function settleWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      try {
        results[index] = { status: 'fulfilled', value: await task(item) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
