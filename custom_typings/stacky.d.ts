declare module 'stacky' {
  interface ParsedStackFrame {
    method: string;
    location: string;
    line: number;
    column: number;
  }
  type StyleFunction = (part: string) => string;
  interface Options {
    maxMethodPadding?: number;
    indent?: string;
    methodPlaceholder?: string;
    locationStrip?: (string|RegExp)[];
    unimportantLocation?: (string|RegExp)[];
    filter?: (line: ParsedStackFrame) => boolean;
    styles?: {
      method?: StyleFunction;
      location?: StyleFunction;
      line?: StyleFunction;
      column?: StyleFunction;
      unimportant?: StyleFunction;
    };
  }
  export function clean(lines: ParsedStackFrame[], options: Options): void;
  export function pretty(errorStack: string|ParsedStackFrame[], options: Options): string;
}
