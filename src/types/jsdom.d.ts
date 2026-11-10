declare module "jsdom" {
  export class JSDOM {
    window: Window & typeof globalThis & Record<string, unknown>;
    constructor(html: string, options?: { url?: string });
  }
}
