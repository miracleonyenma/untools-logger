interface LoggerOptions {
  showInProd?: boolean;
  includeTimestamp?: boolean;
  maxDepth?: number;
  maxStringLength?: number;
  enableCircularHandling?: boolean;
  domElementFormat?: "inspect" | "summary" | "disabled";
}

class Logger {
  private showInProd: boolean;
  private includeTimestamp: boolean;
  private maxDepth: number;
  private maxStringLength: number;
  private enableCircularHandling: boolean;
  private domElementFormat: "inspect" | "summary" | "disabled";
  private env: {
    isDevelopment: boolean;
    isNode: boolean;
    isBrowser: boolean;
    isEdgeRuntime: boolean;
  };

  constructor(options: LoggerOptions = {}) {
    this.showInProd = options.showInProd ?? false;
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.maxDepth = options.maxDepth ?? 5;
    this.maxStringLength = options.maxStringLength ?? 10000;
    this.enableCircularHandling = options.enableCircularHandling ?? true;
    this.domElementFormat = options.domElementFormat ?? "summary";
    this.env = this.getEnvironment();
  }

  private getEnvironment() {
    let isNode = false;
    let isBrowser = false;
    let isEdgeRuntime = false;
    let isDevelopment = true;

    // First, check for Edge Runtime as it's the most restrictive
    if (
      typeof process !== "undefined" &&
      typeof process.env === "object" &&
      process.env.NEXT_RUNTIME === "edge"
    ) {
      isEdgeRuntime = true;
      isDevelopment = process.env.NODE_ENV !== "production";
    }
    // Then check for browser
    else if (typeof window !== "undefined") {
      isBrowser = true;
      isDevelopment =
        !window.location.hostname.includes("production") &&
        (typeof process === "undefined" ||
          (typeof process.env === "object" &&
            process.env.NODE_ENV !== "production"));
    }
    // Lastly check for Node.js (but only if not in Edge Runtime)
    else if (!isEdgeRuntime && typeof process !== "undefined") {
      try {
        // This block won't be executed in Edge Runtime
        isNode =
          typeof process.versions === "object" && process.versions != null;
        isDevelopment =
          typeof process.env === "object" &&
          process.env.NODE_ENV !== "production";
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

    return [
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

  private formatArgument(
    arg: unknown,
    depth = 0,
    seen = new WeakMap<object, boolean>()
  ): string {
    // Check for max depth to prevent call stack overflow
    if (depth > this.maxDepth) {
      return "[Max Depth Reached]";
    }

    if (arg === null) {
      return "null";
    }

    if (arg === undefined) {
      return "undefined";
    }

    if (typeof arg === "string") {
      if (arg.length > this.maxStringLength) {
        return `${arg.substring(0, this.maxStringLength)}... [truncated, ${
          arg.length
        } chars total]`;
      }
      return arg;
    }

    if (
      typeof arg === "number" ||
      typeof arg === "boolean" ||
      typeof arg === "symbol" ||
      typeof arg === "bigint"
    ) {
      return String(arg);
    }

    if (typeof arg === "function") {
      return `[Function: ${arg.name || "anonymous"}]`;
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
      return arg.toISOString();
    }

    if (arg instanceof RegExp) {
      return arg.toString();
    }

    if (Array.isArray(arg)) {
      if (this.enableCircularHandling && seen.has(arg)) {
        return "[Circular Reference]";
      }

      if (this.enableCircularHandling) {
        seen.set(arg, true);
      }

      const items = arg
        .map((item) => this.formatArgument(item, depth + 1, seen))
        .join(", ");
      return `[${items}]`;
    }

    if (typeof arg === "object" && arg !== null) {
      if (this.enableCircularHandling && seen.has(arg)) {
        return "[Circular Reference]";
      }

      if (this.enableCircularHandling) {
        seen.set(arg, true);
      }

      try {
        const entries = Object.entries(arg as Record<string, unknown>).map(
          ([key, value]) =>
            `${key}: ${this.formatArgument(value, depth + 1, seen)}`
        );
        return `{${entries.join(", ")}}`;
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
      // If it's a DOM element or a circular object, use our custom formatter
      // Otherwise, pass the original object to console for better browser inspection
      const formattedArgs: unknown[] = [];
      const rawObjects: unknown[] = [];

      args.forEach((arg) => {
        if (
          (typeof window !== "undefined" &&
            typeof Element !== "undefined" &&
            arg instanceof Element) ||
          (typeof arg === "object" && arg !== null)
        ) {
          formattedArgs.push(this.formatArgument(arg));
          rawObjects.push(arg);
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
      if (rawObjects.length > 0) {
        console.groupCollapsed("Raw Objects");
        rawObjects.forEach((obj) => console[level](obj));
        console.groupEnd();
      }

      return;
    }

    // Node.js or Edge Runtime output with colors
    // Note: Colors might not work properly in all Edge Runtime environments
    const colors = {
      log: "\x1b[36m", // Cyan
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m", // Green
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
      reset: "\x1b[0m", // Reset
    };

    // In Edge Runtime, we might want to skip fancy colors
    if (this.env.isEdgeRuntime) {
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

// Create default instance
const logger = new Logger();

export { Logger, logger, type LoggerOptions };
