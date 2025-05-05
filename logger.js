/**
 * Enhanced logging utility with security improvements
 * Logs contain no identifiable information and are served from memory.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Log levels
const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  SECURITY: 4 // New security-specific level
};

// Configure log level from environment or default to INFO
const LOG_LEVEL = process.env.LOG_LEVEL ? 
  LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LEVELS.INFO : 
  LEVELS.INFO;

// Log directory with secure permissions
const LOG_DIR = path.join(__dirname, '../../logs'); 

// Create log directory if it doesn't exist with secure permissions
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o750 }); // Secure permissions
}

// File for persistent logging with rotation
const LOG_FILE = path.join(LOG_DIR, `app-${new Date().toISOString().split('T')[0]}.log`);

/**
 * Formats a log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} Formatted log message
 */
function formatLogMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Sanitizes sensitive data from log messages
 * @param {string} message - Log message
 * @returns {string} Sanitized log message
 */
function sanitizeLogMessage(message) {
  if (!message) return '';
  
  // Replace potential PII patterns
  let sanitized = message;
  
  // Replace email addresses
  sanitized = sanitized.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL]');
  
  // Replace IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  
  // Replace token patterns
  sanitized = sanitized.replace(/token[:=]\s*["']?\w+["']?/gi, 'token=[REDACTED]');
  
  // Replace password patterns
  sanitized = sanitized.replace(/password[:=]\s*["']?\w+["']?/gi, 'password=[REDACTED]');
  
  return sanitized;
}

/**
 * Writes a message to the log file with rotation support
 * @param {string} message - Formatted log message
 */
function writeToFile(message) {
  try {
    // Check if log file size exceeds limit (10MB)
    const LOG_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
    
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      
      if (stats.size >= LOG_SIZE_LIMIT) {
        // Rotate log file
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const newFileName = `app-${timestamp}.log`;
        const rotatedLogFile = path.join(LOG_DIR, newFileName);
        
        fs.renameSync(LOG_FILE, rotatedLogFile);
      }
    }
    
    // Append to log file (create if doesn't exist)
    fs.appendFile(LOG_FILE, message + '\n', { mode: 0o640 }, (err) => {
      if (err) console.error('Error writing to log file:', err);
    });
  } catch (error) {
    console.error('Error handling log file:', error);
  }
}

/**
 * Logs a message at the specified level
 * @param {number} level - Log level number
 * @param {string} levelName - Log level name
 * @param {string} message - Log message
 */
function log(level, levelName, message) {
  if (level <= LOG_LEVEL) {
    // Sanitize the message to remove sensitive data
    const sanitizedMessage = sanitizeLogMessage(message);
    const formattedMessage = formatLogMessage(levelName, sanitizedMessage);
    
    // Output to console with color
    switch (levelName) {
      case 'ERROR':
        console.error('\x1b[31m%s\x1b[0m', formattedMessage);
        break;
      case 'WARN':
        console.warn('\x1b[33m%s\x1b[0m', formattedMessage);
        break;
      case 'INFO':
        console.info('\x1b[36m%s\x1b[0m', formattedMessage);
        break;
      case 'DEBUG':
        console.debug('\x1b[90m%s\x1b[0m', formattedMessage);
        break;
      case 'SECURITY':
        console.warn('\x1b[35m%s\x1b[0m', formattedMessage); // Purple for security logs
        break;
      default:
        console.log(formattedMessage);
    }
    
    // Write to log file
    writeToFile(formattedMessage);
  }
}

/**
 * Logger object with methods for each log level
 */
const logger = {
  error: (message) => log(LEVELS.ERROR, 'ERROR', message),
  warn: (message) => log(LEVELS.WARN, 'WARN', message),
  info: (message) => log(LEVELS.INFO, 'INFO', message),
  debug: (message) => log(LEVELS.DEBUG, 'DEBUG', message),
  
  /**
   * Logs a security-related event
   * @param {string} message - Message to log
   * @param {Object} data - Additional data to include (will be sanitized)
   */
  security: (message, data = {}) => {
    // Create a deep copy of data to avoid modifying the original
    const dataCopy = JSON.parse(JSON.stringify(data));
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'sessionToken', 'csrfToken', 'secret'];
    
    sensitiveFields.forEach(field => {
      if (dataCopy[field]) {
        dataCopy[field] = '[REDACTED]';
      }
    });
    
    // Create message with data
    const fullMessage = data ? 
      `${message} ${JSON.stringify(dataCopy)}` : 
      message;
    
    // Log at security level
    log(LEVELS.SECURITY, 'SECURITY', fullMessage);
    
    // For critical security events, could implement notifications here
    if (data && data.critical) {
      // Example: send email, SMS, or other alert
    }
  },
  
  /**
   * Sets the current log level
   * @param {string} level - Log level name
   */
  setLevel: (level) => {
    if (LEVELS[level.toUpperCase()] !== undefined) {
      LOG_LEVEL = LEVELS[level.toUpperCase()];
    }
  }
};

// Clear logs every 24 hours
setInterval(() => {
  // Only keep logs for the last 7 days
  fs.readdir(LOG_DIR, (err, files) => {
    if (err) {
      console.error('Error reading log directory:', err);
      return;
    }
    
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
      if (file.startsWith('app-') && file.endsWith('.log')) {
        const filePath = path.join(LOG_DIR, file);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.error(`Error getting stats for file ${file}:`, err);
            return;
          }
          
          // Delete files older than a week
          if (now - stats.mtime.getTime() > ONE_WEEK) {
            fs.unlink(filePath, err => {
              if (err) {
                console.error(`Error deleting old log file ${file}:`, err);
              } else {
                console.info(`Deleted old log file: ${file}`);
              }
            });
          }
        });
      }
    });
  });
}, 24 * 60 * 60 * 1000); // 24 hours

module.exports = logger;
