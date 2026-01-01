export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LoggerOptions {
  showInProd?: boolean;
  includeTimestamp?: boolean;
  maxDepth?: number;
  maxStringLength?: number;
  enableCircularHandling?: boolean;
  domElementFormat?: "inspect" | "summary" | "disabled";
  prettyPrint?: boolean;
  indentSize?: number;
  colors?: boolean;
  logLevel?: LogLevel;
  namespace?: string;
  enabled?: boolean;
}

interface FormatOptions {
  indentation?: string;
  depth?: number;
  seen?: WeakMap<object, boolean>;
}

interface ColorScheme {
  string: string;
  number: string;
  boolean: string;
  null: string;
  undefined: string;
  function: string;
  symbol: string;
  date: string;
  regexp: string;
  key: string;
  bracket: string;
  circular: string;
  truncated: string;
  maxDepth: string;
  reset: string;
}

class Logger {
  private showInProd: boolean;
  private includeTimestamp: boolean;
  private maxDepth: number;
  private maxStringLength: number;
  private enableCircularHandling: boolean;
  private domElementFormat: "inspect" | "summary" | "disabled";
  private prettyPrint: boolean;
  private indentSize: number;
  private useColors: boolean;
  private logLevel: LogLevel;
  private namespace: string;
  private enabled: boolean;
  private env: {
    isDevelopment: boolean;
    isNode: boolean;
    isBrowser: boolean;
    isEdgeRuntime: boolean;
  };
  private consoleColors: ColorScheme;
  private browserColors: ColorScheme;

  constructor(options: LoggerOptions = {}) {
    this.showInProd = options.showInProd ?? false;
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.maxDepth = options.maxDepth ?? 5;
    this.maxStringLength = options.maxStringLength ?? 10000;
    this.enableCircularHandling = options.enableCircularHandling ?? true;
    this.domElementFormat = options.domElementFormat ?? "summary";
    this.prettyPrint = options.prettyPrint ?? true;
    this.indentSize = options.indentSize ?? 2;
    this.useColors = options.colors ?? true;
    this.logLevel = options.logLevel ?? LogLevel.INFO;
    this.namespace = options.namespace ?? "";
    this.enabled = options.enabled ?? true;
    this.env = this.getEnvironment();

    // Console color schemes for Node.js
    this.consoleColors = {
      string: "\x1b[32m", // Green
      number: "\x1b[36m", // Cyan
      boolean: "\x1b[35m", // Magenta
      null: "\x1b[90m", // Gray
      undefined: "\x1b[90m", // Gray
      function: "\x1b[36m", // Cyan
      symbol: "\x1b[35m", // Magenta
      date: "\x1b[34m", // Blue
      regexp: "\x1b[35m", // Magenta
      key: "\x1b[33m", // Yellow
      bracket: "\x1b[90m", // Gray
      circular: "\x1b[31m", // Red
      truncated: "\x1b[90m", // Gray
      maxDepth: "\x1b[90m", // Gray
      reset: "\x1b[0m", // Reset
    };

    // CSS color schemes for browser
    this.browserColors = {
      string: "color: green;",
      number: "color: cyan;",
      boolean: "color: magenta;",
      null: "color: gray;",
      undefined: "color: gray;",
      function: "color: cyan;",
      symbol: "color: magenta;",
      date: "color: blue;",
      regexp: "color: magenta;",
      key: "color: #b58900;",
      bracket: "color: gray;",
      circular: "color: red;",
      truncated: "color: gray;",
      maxDepth: "color: gray;",
      reset: "",
    };
  }

  /**
   * Sets the log level.
   * @param {LogLevel} level - The new log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Enables or disables logging.
   * @param {boolean} enabled - Whether to enable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private getEnvironment() {
    let isNode = false;
    let isBrowser = false;
    let isEdgeRuntime = false;
    let isDevelopment = true;

    // First, check for Edge Runtime as it's the most restrictive
    if (
      typeof process !== "undefined" &&
      typeof process?.env === "object" &&
      process?.env.NEXT_RUNTIME === "edge"
    ) {
      isEdgeRuntime = true;
      isDevelopment = process?.env.NODE_ENV !== "production";
    }
    // Then check for browser
    else if (typeof window !== "undefined") {
      isBrowser = true;
      isDevelopment =
        !window?.location?.hostname?.includes?.("production") &&
        (typeof process === "undefined" ||
          (typeof process?.env === "object" &&
            process?.env.NODE_ENV !== "production"));
    }
    // Lastly check for Node.js (but only if not in Edge Runtime)
    else if (!isEdgeRuntime && typeof process !== "undefined") {
      try {
        // This block won't be executed in Edge Runtime
        isNode =
          typeof process?.versions === "object" && process?.versions != null;
        isDevelopment =
          typeof process?.env === "object" &&
          process?.env.NODE_ENV !== "production";
      } catch (e) {
        // Fallback for environments where process exists but versions is not accessible
        isNode = false;
      }
    }

    return { isDevelopment, isNode, isBrowser, isEdgeRuntime };
  }

  private getCallerInfo() {
    const callerInfo = { file: "unknown", line: "unknown", column: "unknown" };

    try {
      const stack = new Error().stack;
      if (stack) {
        // Split the stack trace into lines
        const lines = stack.split("\n");

        // Find the first line that doesn't include our logger file
        let callerLine = "";
        for (let i = 1; i < lines.length; i++) {
          if (
            !lines[i].includes("debugLogger.ts") &&
            !lines[i].includes("at Logger.")
          ) {
            callerLine = lines[i];
            break;
          }
        }

        if (this.env.isNode) {
          // Node.js style stack trace
          const matches = callerLine?.match(/\((.*):(\d+):(\d+)\)$/);
          if (matches) {
            callerInfo.file = matches[1]?.split("/").pop() || "unknown";
            callerInfo.line = matches[2] || "unknown";
            callerInfo.column = matches[3] || "unknown";
          }
        } else {
          // Browser style stack trace
          const matches = callerLine?.match(/at (?:.*? \()?(.+):(\d+):(\d+)/);
          if (matches) {
            callerInfo.file = matches[1]?.split("/").pop() || "unknown";
            callerInfo.line = matches[2] || "unknown";
            callerInfo.column = matches[3] || "unknown";
          }
        }
      }
    } catch {
      // If stack trace parsing fails, we'll use default unknown values
    }

    return callerInfo;
  }

  private formatMetadata(level: string) {
    const callerInfo = this.getCallerInfo();
    const timestamp = this.includeTimestamp ? new Date().toISOString() : "";
    const namespaceStr = this.namespace ? `[${this.namespace}]` : "";

    return [
      namespaceStr,
      `[${level.toUpperCase()}]`,
      this.includeTimestamp ? `[${timestamp}]` : "",
      `[${callerInfo.file}:${callerInfo.line}]`,
    ].filter(Boolean);
  }

  private formatDOMElement(element: any): string {
    if (this.domElementFormat === "disabled") {
      return "[DOM Element]";
    }

    // Safety check - ensure we're dealing with a DOM element
    if (
      !this.env.isBrowser ||
      !element ||
      typeof element.tagName !== "string"
    ) {
      return "[DOM Element]";
    }

    if (this.domElementFormat === "inspect") {
      let attributes = "";
      if (element.attributes) {
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          attributes += ` ${attr.name}="${attr.value}"`;
        }
      }

      let children = "";
      if (element.children && element.children.length > 0) {
        children = ` (${element.children.length} children)`;
      }

      return `<${element.tagName.toLowerCase()}${attributes}>${children}`;
    }

    // Default: summary
    return `<${element.tagName.toLowerCase()}> with ${
      element.attributes?.length || 0
    } attributes and ${element.children?.length || 0} children`;
  }

  private colorizeText(text: string, type: keyof ColorScheme): string {
    if (!this.useColors) return text;

    if (this.env.isNode && !this.env.isEdgeRuntime) {
      return `${this.consoleColors[type]}${text}${this.consoleColors.reset}`;
    }

    return text; // In browser we handle coloring differently via CSS
  }

  private getIndentation(depth: number): string {
    return " ".repeat(depth * this.indentSize);
  }

  private formatArgument(arg: unknown, options: FormatOptions = {}): string {
    const depth = options.depth ?? 0;
    const seen = options.seen ?? new WeakMap<object, boolean>();
    const indentation = options.indentation ?? "";

    // Check for max depth to prevent call stack overflow
    if (depth > this.maxDepth) {
      return this.colorizeText("[Max Depth Reached]", "maxDepth");
    }

    if (arg === null) {
      return this.colorizeText("null", "null");
    }

    if (arg === undefined) {
      return this.colorizeText("undefined", "undefined");
    }

    if (typeof arg === "string") {
      if (arg.length > this.maxStringLength) {
        const truncated = `${arg.substring(0, this.maxStringLength)}...`;
        const truncatedMsg = this.colorizeText(
          ` [truncated, ${arg.length} chars total]`,
          "truncated"
        );
        return this.colorizeText(`"${truncated}"`, "string") + truncatedMsg;
      }
      return this.colorizeText(`"${arg}"`, "string");
    }

    if (typeof arg === "number") {
      return this.colorizeText(String(arg), "number");
    }

    if (typeof arg === "boolean") {
      return this.colorizeText(String(arg), "boolean");
    }

    if (typeof arg === "symbol") {
      return this.colorizeText(String(arg), "symbol");
    }

    if (typeof arg === "bigint") {
      return this.colorizeText(`${String(arg)}n`, "number");
    }

    if (typeof arg === "function") {
      return this.colorizeText(
        `[Function: ${arg.name || "anonymous"}]`,
        "function"
      );
    }

    // Safely check if the argument is a DOM Element
    if (
      this.env.isBrowser &&
      typeof window !== "undefined" &&
      typeof Element !== "undefined" &&
      arg instanceof Element
    ) {
      return this.formatDOMElement(arg);
    }

    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
    }

    if (arg instanceof Date) {
      return this.colorizeText(arg.toISOString(), "date");
    }

    if (arg instanceof RegExp) {
      return this.colorizeText(arg.toString(), "regexp");
    }

    if (Array.isArray(arg)) {
      if (this.enableCircularHandling && seen.has(arg)) {
        return this.colorizeText("[Circular Reference]", "circular");
      }

      if (this.enableCircularHandling) {
        seen.set(arg, true);
      }

      if (arg.length === 0) {
        return this.colorizeText("[]", "bracket");
      }

      if (!this.prettyPrint) {
        const items = arg
          .map((item) => this.formatArgument(item, { depth: depth + 1, seen }))
          .join(", ");
        return (
          this.colorizeText("[", "bracket") +
          items +
          this.colorizeText("]", "bracket")
        );
      }

      const nextIndent = indentation + this.getIndentation(1);
      const items = arg
        .map(
          (item) =>
            nextIndent +
            this.formatArgument(item, {
              depth: depth + 1,
              seen,
              indentation: nextIndent,
            })
        )
        .join(",\n");

      return (
        this.colorizeText("[", "bracket") +
        "\n" +
        items +
        "\n" +
        indentation +
        this.colorizeText("]", "bracket")
      );
    }

    if (typeof arg === "object" && arg !== null) {
      if (this.enableCircularHandling && seen.has(arg)) {
        return this.colorizeText("[Circular Reference]", "circular");
      }

      if (this.enableCircularHandling) {
        seen.set(arg, true);
      }

      try {
        const entries = Object.entries(arg as Record<string, unknown>);

        if (entries.length === 0) {
          return this.colorizeText("{}", "bracket");
        }

        if (!this.prettyPrint) {
          const formattedEntries = entries.map(
            ([key, value]) =>
              this.colorizeText(key, "key") +
              ": " +
              this.formatArgument(value, { depth: depth + 1, seen })
          );
          return (
            this.colorizeText("{", "bracket") +
            formattedEntries.join(", ") +
            this.colorizeText("}", "bracket")
          );
        }

        const nextIndent = indentation + this.getIndentation(1);
        const formattedEntries = entries
          .map(
            ([key, value]) =>
              nextIndent +
              this.colorizeText(key, "key") +
              ": " +
              this.formatArgument(value, {
                depth: depth + 1,
                seen,
                indentation: nextIndent,
              })
          )
          .join(",\n");

        return (
          this.colorizeText("{", "bracket") +
          "\n" +
          formattedEntries +
          "\n" +
          indentation +
          this.colorizeText("}", "bracket")
        );
      } catch (error) {
        // Type-safe error handling
        const errorMessage =
          error instanceof Error ? error.message : "unknown error";
        return `[Object: failed to stringify - ${errorMessage}]`;
      }
    }

    return String(arg);
  }

  private _log(
    level: "debug" | "info" | "warn" | "error" | "log",
    ...args: unknown[]
  ) {
    if (!this.enabled) {
      return;
    }

    const levelPriority = {
      error: LogLevel.ERROR,
      warn: LogLevel.WARN,
      info: LogLevel.INFO,
      log: LogLevel.INFO,
      debug: LogLevel.DEBUG,
    };

    if (this.logLevel < levelPriority[level]) {
      return;
    }

    // Check if we should show logs in current environment
    if (!this.env.isDevelopment && !this.showInProd) {
      return;
    }

    const metadata = this.formatMetadata(level);

    // Browser-specific styling
    if (this.env.isBrowser && !this.env.isNode) {
      const styles = {
        log: "color: #0099cc",
        debug: "color: #0099cc",
        info: "color: #00cc00",
        warn: "color: #cccc00",
        error: "color: #cc0000",
      };

      // Special handling for objects in browser
      const formattedArgs: unknown[] = [];
      const rawObjects: unknown[] = [];

      args.forEach((arg) => {
        if (
          (typeof window !== "undefined" &&
            typeof Element !== "undefined" &&
            arg instanceof Element) ||
          (typeof arg === "object" && arg !== null)
        ) {
          // We'll pretty-print complex objects but also log raw objects for inspection
          formattedArgs.push(this.formatArgument(arg));
          if (this.prettyPrint) {
            rawObjects.push(arg);
          }
        } else {
          formattedArgs.push(this.formatArgument(arg));
        }
      });

      // Log with formatting
      console[level](
        `%c${[...metadata, ...formattedArgs].join(" ")}`,
        styles[level]
      );

      // Additionally log raw objects for better browser inspection if they exist
      if (this.prettyPrint && rawObjects.length > 0) {
        console.groupCollapsed("Raw Objects (for inspection)");
        rawObjects.forEach((obj) => console[level](obj));
        console.groupEnd();
      }

      return;
    }

    // Node.js or Edge Runtime output with colors
    const colors = {
      log: "\x1b[36m", // Cyan
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m", // Green
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
      reset: "\x1b[0m", // Reset
    };

    // In Edge Runtime, we might want to skip fancy colors
    if (this.env.isEdgeRuntime || !this.useColors) {
      const formattedArgs = args.map((arg) => this.formatArgument(arg));
      console[level](...metadata, ...formattedArgs);
    } else {
      const formattedArgs = args.map((arg) => this.formatArgument(arg));
      console[level](
        colors[level],
        ...metadata,
        ...formattedArgs,
        colors.reset
      );
    }
  }

  log(...args: unknown[]) {
    this._log("log", ...args);
  }

  debug(...args: unknown[]) {
    this._log("debug", ...args);
  }

  info(...args: unknown[]) {
    this._log("info", ...args);
  }

  warn(...args: unknown[]) {
    this._log("warn", ...args);
  }

  error(...args: unknown[]) {
    this._log("error", ...args);
  }

  // Group logging for better organization - safe for all environments
  group(label: string) {
    if (!this.env.isDevelopment && !this.showInProd) {
      return;
    }

    if (typeof console.group === "function") {
      console.group(label);
    } else {
      console.log(`=== GROUP START: ${label} ===`);
    }
  }

  groupEnd() {
    if (!this.env.isDevelopment && !this.showInProd) {
      return;
    }

    if (typeof console.groupEnd === "function") {
      console.groupEnd();
    } else {
      console.log("=== GROUP END ===");
    }
  }

  // Utility method to time operations
  time(label: string) {
    if (!this.env.isDevelopment && !this.showInProd) {
      return;
    }

    if (typeof console.time === "function") {
      console.time(label);
    }
  }

  timeEnd(label: string) {
    if (!this.env.isDevelopment && !this.showInProd) {
      return;
    }

    if (typeof console.timeEnd === "function") {
      console.timeEnd(label);
    }
  }
}

// Create default instance with pretty print enabled
const logger = new Logger({
  prettyPrint: true,
  colors: true,
});

export { Logger, logger, type LoggerOptions };
