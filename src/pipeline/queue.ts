export type QueueHandler<T> = (item: T) => Promise<void>;
export type QueueErrorHandler<T> = (error: unknown, item: T) => void;

type StopOptions = {
  drain: boolean;
};

export class BoundedAsyncQueue<T> {
  private readonly items: T[] = [];
  private stopRequested = false;
  private loop: Promise<void> | null = null;
  private wakeResolver: (() => void) | null = null;

  constructor(
    private readonly maxSize: number,
    private readonly onError?: QueueErrorHandler<T>,
  ) {}

  get size(): number {
    return this.items.length;
  }

  start(handler: QueueHandler<T>) {
    if (this.loop) {
      return;
    }
    this.stopRequested = false;
    this.loop = this.runLoop(handler);
  }

  enqueue(item: T): boolean {
    if (this.stopRequested || this.items.length >= this.maxSize) {
      return false;
    }
    this.items.push(item);
    this.wake();
    return true;
  }

  async stop(options: StopOptions = { drain: false }): Promise<void> {
    this.stopRequested = true;
    if (!options.drain) {
      this.items.length = 0;
    }
    this.wake();
    await this.loop;
    this.loop = null;
  }

  private async runLoop(handler: QueueHandler<T>): Promise<void> {
    while (true) {
      if (this.items.length === 0) {
        if (this.stopRequested) {
          return;
        }
        await this.waitForWake();
        continue;
      }

      const item = this.items.shift();
      if (!item) {
        continue;
      }

      try {
        await handler(item);
      } catch (error) {
        this.onError?.(error, item);
      }
    }
  }

  private waitForWake(): Promise<void> {
    return new Promise((resolve) => {
      this.wakeResolver = resolve;
    });
  }

  private wake() {
    const resolver = this.wakeResolver;
    this.wakeResolver = null;
    resolver?.();
  }
}
