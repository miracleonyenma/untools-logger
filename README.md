# @untools/logger

A powerful and flexible logging utility for JavaScript and TypeScript applications that handles complex data types including DOM elements and circular references.

## Features

- Handles DOM elements, circular references, and complex objects
- Color-coded console output
- Stack trace info for each log
- Works in both Node.js and browser environments
- Configurable logging levels
- Timestamp support
- Grouping and timing functionality

## Installation

```bash
npm install @untools/logger
```

## Basic Usage

```javascript
import { logger } from '@untools/logger';

// Basic logging
logger.info('Server started on port 3000');
logger.warn('Deprecated function called');
logger.error(new Error('Something went wrong'));
logger.debug({ user: { id: 1, name: 'John' } });

// Logging DOM elements (browser only)
logger.info(document.getElementById('app'));

// Handling circular references
const circular = { name: 'circular object' };
circular.self = circular;
logger.info(circular);
```

## Custom Logger Configuration

```javascript
import { Logger } from '@untools/logger';

const customLogger = new Logger({
  showInProd: true,
  includeTimestamp: true,
  maxDepth: 3,
  maxStringLength: 5000,
  enableCircularHandling: true,
  domElementFormat: 'inspect'
});

customLogger.info('Using custom logger configuration');
```

## API

### LoggerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| showInProd | boolean | false | Show logs in production environments |
| includeTimestamp | boolean | true | Include ISO timestamps in logs |
| maxDepth | number | 5 | Maximum recursion depth for object formatting |
| maxStringLength | number | 10000 | Maximum string length before truncation |
| enableCircularHandling | boolean | true | Enable detection and handling of circular references |
| domElementFormat | 'inspect' \| 'summary' \| 'disabled' | 'summary' | Format for DOM elements |

### Methods

- `log(...args)`: General logging
- `debug(...args)`: Debug level logging
- `info(...args)`: Information level logging
- `warn(...args)`: Warning level logging
- `error(...args)`: Error level logging
- `group(label)`: Start a collapsible group in console
- `groupEnd()`: End the current group
- `time(label)`: Start a timer
- `timeEnd(label)`: End timer and log elapsed time

## License

MIT
