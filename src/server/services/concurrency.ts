/**
 * Bound the number of concurrently running async tasks. Tasks submitted beyond
 * `max` queue and start as in-flight ones settle, so a burst of work (e.g. a
 * bulk upload, or several concurrent requests) can't pile unbounded
 * decode/encode buffers onto the heap at once.
 *
 * Results resolve/reject independently and preserve no ordering of their own;
 * callers that need ordered results should keep their input order (e.g. via
 * `Promise.all(items.map(...))`, which preserves array order).
 */
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createLimiter: max must be a positive integer, got ${max}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    while (active < max && queue.length > 0) {
      active++;
      queue.shift()?.();
    }
  };

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    });
  };
}
