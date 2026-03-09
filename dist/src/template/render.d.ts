import type { HaEvent } from "../ha/ws-client.js";
export type TemplateContext = {
    event_type: string;
    time_fired: string;
    message: string;
    title: string;
    severity: string;
    data_json: string;
};
export declare function extractEventMessage(event: HaEvent, maxChars?: number): string;
export declare function buildTemplateContext(event: HaEvent, maxChars?: number): TemplateContext;
export declare function renderTemplate(template: string, context: TemplateContext): string;
