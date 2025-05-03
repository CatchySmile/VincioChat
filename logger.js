/**
 * Simple logging utility 
 * Logs contain no identifiable information and are served from memory.
 */
const fs = require('fs');
const path = require('path');

// Log levels
const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Configure log level from environment or default to INFO
const LOG_LEVEL = process.env.LOG_LEVEL ? 
  LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LEVELS.INFO : 
  LEVELS.INFO;

// Log directory (unused)
const LOG_DIR = path.join(__dirname, '../../logs'); 

// Create log directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// File for persistent logging (unused)
const LOG_FILE = path.join(LOG_DIR, 'app.log');

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
 * Writes a message to the log file
 * @param {string} message - Formatted log message
 */
function writeToFile(message) {
  // Append to log file (create if doesn't exist)
  fs.appendFile(LOG_FILE, message + '\n', (err) => {
    if (err) console.error('Error writing to log file:', err);
  });
}

/**
 * Logs a message at the specified level
 * @param {number} level - Log level number
 * @param {string} levelName - Log level name
 * @param {string} message - Log message
 */
function log(level, levelName, message) {
  if (level <= LOG_LEVEL) {
    const formattedMessage = formatLogMessage(levelName, message);
    
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
   * Sets the current log level
   * @param {string} level - Log level name
   */
  setLevel: (level) => {
    if (LEVELS[level.toUpperCase()] !== undefined) {
      LOG_LEVEL = LEVELS[level.toUpperCase()];
    }
  }
};

// Ensure logs clear every 30 minutes
setInterval(() => {
  fs.writeFile(LOG_FILE, '', (err) => {
    if (err) console.error('Error clearing log file:', err);
  });
}, 30 * 60 * 1000); // 30 minutes
// Clear logs on startup
fs.writeFile(LOG_FILE, '', (err) => {
  if (err) console.error('Error clearing log file:', err);
});

module.exports = logger;
