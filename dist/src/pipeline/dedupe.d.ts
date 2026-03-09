export declare class EventDeduper {
    private readonly windowMs;
    private readonly cache;
    constructor(windowMs: number);
    shouldDrop(key: string, now?: number): boolean;
    private gc;
}
