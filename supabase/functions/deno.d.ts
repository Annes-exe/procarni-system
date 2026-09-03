// Global declarations for Deno runtime in Supabase Edge Functions for IDE language servers
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve?: (handler: (req: Request) => Promise<Response> | Response) => void;
  [key: string]: any;
};

declare module 'https://*' {
  const all: any;
  export = all;
  export default all;
  export const serve: any;
  export const createClient: any;
  export const PDFDocument: any;
  export const rgb: any;
  export const StandardFonts: any;
  export const PDFFont: any;
  export const PDFPage: any;
  export const degrees: any;
  export const crypto: any;
}
