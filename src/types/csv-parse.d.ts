// Lightweight module declaration for sync CSV parser used in the project
declare module 'csv-parse/sync' {
  export function parse(input: string | Buffer, options?: any): any[];
}
export {};

