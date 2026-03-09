export type QueueHandler<T> = (item: T) => Promise<void>;
export type QueueErrorHandler<T> = (error: unknown, item: T) => void;
type StopOptions = {
    drain: boolean;
};
export declare class BoundedAsyncQueue<T> {
    private readonly maxSize;
    private readonly onError?;
    private readonly items;
    private stopRequested;
    private loop;
    private wakeResolver;
    constructor(maxSize: number, onError?: QueueErrorHandler<T> | undefined);
    get size(): number;
    start(handler: QueueHandler<T>): void;
    enqueue(item: T): boolean;
    stop(options?: StopOptions): Promise<void>;
    private runLoop;
    private waitForWake;
    private wake;
}
export {};
