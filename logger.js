/**
 * Privacy-Focused Logger
 * 
 * Minimalist logging utility that prioritizes user privacy
 * and provides clean, structured logs with zero PII retention.
 */
const crypto = require('crypto');
const path = require('path');

// Log levels with clearer separation of concerns
const LEVELS = {
  ERROR: {
    value: 0,
    label: 'ERROR',
    color: '\x1b[31m', // Red
    icon: '✖'
  },
  WARN: {
    value: 1,
    label: 'WARN',
    color: '\x1b[33m', // Yellow
    icon: '⚠'
  },
  INFO: {
    value: 2,
    label: 'INFO',
    color: '\x1b[36m', // Cyan
    icon: 'ℹ'
  },
  DEBUG: {
    value: 3,
    label: 'DEBUG',
    color: '\x1b[90m', // Gray
    icon: '⋯'
  },
  AUDIT: {
    value: 4,
    label: 'AUDIT',
    color: '\x1b[35m', // Purple
    icon: '⚙'
  }
};

// Configurable options with better defaults for privacy
const config = {
  // Only keep in-memory logs by default
  memoryOnly: true,
  
  // Memory log retention (entries)
  memoryLogLimit: 1000,
  
  // Configure log level from environment or default to INFO
  logLevel: process.env.LOG_LEVEL ? 
    (LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LEVELS.INFO) : 
    LEVELS.INFO,
    
  // Hashing salt (generate random by default)
  hashingSalt: process.env.LOG_SALT || crypto.randomBytes(16).toString('hex'),
  
  // Identifier pattern matches items to hash
  identifierPatterns: [
    /([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{24})/, // UUIDs
    /\b([0-9A-Fa-f]{24,})\b/g,   // Room codes and long hex strings
    /\b(socket\.id|socketId|userId)[:=]\s*["']?(\w+)["']?/gi // Socket IDs
  ]
};

// In-memory log storage (never written to disk)
const memoryLogs = [];

/**
 * Creates a privacy-safe identifier
 * @param {string} identifier - The identifier to hash
 * @returns {string} Truncated hash of the identifier
 */
function createPrivacyHash(identifier) {
  if (!identifier) return '[redacted]';
  
  const hash = crypto.createHash('sha256');
  hash.update(identifier + config.hashingSalt);
  // Return only first 6 characters - enough to identify in logs
    // but not enough to reverse-engineer the original value
    return hash.digest('hex').substring(0, 6);
}

/**
 * Sanitizes a message to protect user privacy
 * @param {string} message - The message to sanitize
 * @returns {string} Privacy-safe message
 */
function sanitizeMessage(message) {
  if (!message) return '';
  
  let sanitized = message.toString();
  
  // Replace sensitive patterns
  sanitized = sanitized
    // Email addresses
    .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[email]')
    // IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    // Authentication tokens
    .replace(/token[:=]\s*["']?\w+["']?/gi, 'token=[redacted]')
    // Passwords and secrets
    .replace(/(?:password|secret|key)[:=]\s*["']?\w+["']?/gi, '$1=[redacted]')
    // Message content - don't log actual chat messages
    .replace(/"text":\s*"([^"]+)"/g, '"text": "[message]"')
    // Username - replace with privacy hash
    .replace(/"username":\s*"([^"]+)"/g, (match, username) => {
      return `"username": "user_${createPrivacyHash(username)}"`;
    });
    
  // Replace identifiers using patterns
  config.identifierPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, (match, id) => {
      if (id) {
        return match.replace(id, createPrivacyHash(id));
      }
      return match;
    });
  });
  
  return sanitized;
}

/**
 * Formats a log entry with consistent styling
 * @param {Object} level - Log level object
 * @param {string} message - Log message
 * @returns {Object} Formatted log entry
 */
function formatLogEntry(level, message) {
  const timestamp = new Date().toISOString();
  const sanitizedMessage = sanitizeMessage(message);
  
  return {
    timestamp,
    level: level.label,
    message: sanitizedMessage,
    // For console output
    formattedMessage: `${level.color}${level.icon} [${timestamp}] [${level.label}]${'\x1b[0m'} ${sanitizedMessage}`
  };
}

/**
 * Logs a message at the specified level
 * @param {Object} level - Log level object
 * @param {string} message - Log message
 */
function log(level, message) {
  // Skip if below configured log level
  if (level.value > config.logLevel.value) {
    return;
  }
  
  // Create formatted log entry
  const entry = formatLogEntry(level, message);
  
  // Output to console with styling
  console.log(entry.formattedMessage);
  
  // Store in memory logs
  if (config.memoryOnly) {
    memoryLogs.push({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message
    });
    
    // Trim memory logs if they exceed the limit
    if (memoryLogs.length > config.memoryLogLimit) {
      memoryLogs.shift();
    }
  }
}

/**
 * The main logger object with methods for each log level
 */
const logger = {
  error: (message) => log(LEVELS.ERROR, message),
  warn: (message) => log(LEVELS.WARN, message),
  info: (message) => log(LEVELS.INFO, message),
  debug: (message) => log(LEVELS.DEBUG, message),
  
  /**
   * Logs security audit events (authentication, permissions)
   * Avoids logging identifiable user information
   * @param {string} action - Action being audited
   * @param {Object} context - Additional audit context
   */
  audit: (action, context = {}) => {
    // Always sanitize context to ensure no PII leakage
    const safeContext = { ...context };
    
    // Specific handling for certain context fields
    if (safeContext.userId) {
      safeContext.userId = createPrivacyHash(safeContext.userId);
    }
    if (safeContext.ip) {
      safeContext.ip = '[ip]';
    }
    
    // Log the audit event
    log(LEVELS.AUDIT, `${action} ${JSON.stringify(safeContext)}`);
  },
  
  /**
   * Gets recent logs (for admin/debugging only)
   * @param {number} count - Number of recent logs to retrieve
   * @returns {Array} Recent log entries
   */
  getRecentLogs: (count = 100) => {
    return memoryLogs.slice(-Math.min(count, memoryLogs.length));
  },
  
  /**
   * Sets the current log level
   * @param {string} level - Log level name
   */
  setLevel: (level) => {
    if (LEVELS[level.toUpperCase()]) {
      config.logLevel = LEVELS[level.toUpperCase()];
    }
  },
  
  /**
   * Changes logger configuration
   * @param {Object} newConfig - New configuration options
   */
  configure: (newConfig = {}) => {
    Object.assign(config, newConfig);
  }
};

module.exports = logger;
