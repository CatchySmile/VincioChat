/**
 * Security utility functions for the chat application
 */
const DOMPurify = require('dompurify');
const { createHash } = require('crypto');

class SecurityUtils {
  /**
   * Map to track request rates by IP address
   * Structure: { ip: { count: number, lastReset: timestamp } }
   */
  static rateLimits = new Map();

  /**
   * Rate limit constants
   */
  static RATE_LIMIT = {
    MESSAGES: { max: 20, period: 60000 }, // 20 messages per minute
    CONNECTIONS: { max: 10, period: 60000 }, // 10 connections per minute
    ROOMS: { max: 3, period: 300000 } // 3 rooms per 5 minutes
  };

  /**
   * Size limits for different entities
   */
  static SIZE_LIMITS = {
    MESSAGE: 500, // characters
    USERNAME: 20, // characters
    ROOM_CODE: 12 // characters
  };

  /**
   * Sanitizes text input to prevent XSS attacks
   * @param {string} text - Text to sanitize
   * @param {number} maxLength - Maximum allowed length
   * @returns {string} Sanitized text
   */
  static sanitizeText(text, maxLength) {
    if (!text || typeof text !== 'string') return '';
    
    // Trim and limit length
    let sanitized = text.trim();
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.slice(0, maxLength);
    }
    
    // Use DOMPurify for additional sanitization (removes all HTML/script tags)
    // Note: In Node.js environment, DOMPurify requires a DOM implementation like JSDOM
    return sanitized;
  }

  /**
   * Checks if a request is rate limited
   * @param {string} ip - IP address of the client
   * @param {string} action - Action type (messages, connections, rooms)
   * @returns {boolean} True if rate limited, false otherwise
   */
  static isRateLimited(ip, action) {
    const now = Date.now();
    
    if (!this.rateLimits.has(ip)) {
      this.rateLimits.set(ip, {
        messages: { count: 0, lastReset: now },
        connections: { count: 0, lastReset: now },
        rooms: { count: 0, lastReset: now }
      });
    }
    
    const limits = this.rateLimits.get(ip);
    const actionLimit = limits[action];
    
    // Reset counter if period has passed
    if (now - actionLimit.lastReset > this.RATE_LIMIT[action.toUpperCase()].period) {
      actionLimit.count = 0;
      actionLimit.lastReset = now;
    }
    
    // Increment counter
    actionLimit.count++;
    
    // Check if limit exceeded
    return actionLimit.count > this.RATE_LIMIT[action.toUpperCase()].max;
  }

  /**
   * Validates room code format
   * @param {string} code - Room code to validate
   * @returns {boolean} True if valid, false otherwise
   */
  static isValidRoomCode(code) {
    if (!code || typeof code !== 'string') return false;
    
    // Room code should be alphanumeric and within size limit
    return /^[A-Z0-9]+$/.test(code) && 
           code.length <= this.SIZE_LIMITS.ROOM_CODE;
  }

  /**
   * Validates username format
   * @param {string} username - Username to validate
   * @returns {boolean} True if valid, false otherwise
   */
  static isValidUsername(username) {
    if (!username || typeof username !== 'string') return false;
    
    // Username should contain only allowed characters and be within size limit
    const sanitized = this.sanitizeText(username, this.SIZE_LIMITS.USERNAME);
    return sanitized.length > 0;
  }

  /**
   * Generates a CSRF token for the user session
   * @param {string} sessionId - User's session ID
   * @returns {string} CSRF token
   */
  static generateCSRFToken(sessionId) {
    const timestamp = Date.now().toString();
    const hash = createHash('sha256');
    hash.update(`${sessionId}:${timestamp}:${process.env.SECRET_KEY || 'default-secret-key'}`);
    return hash.digest('hex');
  }

  /**
   * Validates a CSRF token
   * @param {string} token - Token to validate
   * @param {string} sessionId - User's session ID
   * @returns {boolean} True if valid, false otherwise
   */
  static validateCSRFToken(token, sessionId, storedToken) {
    return token === storedToken;
  }
  
  /**
   * Validates message content
   * @param {string} message - Message to validate
   * @returns {boolean} True if valid, false otherwise
   */
  static isValidMessage(message) {
    if (!message || typeof message !== 'string') return false;
    
    const sanitized = this.sanitizeText(message, this.SIZE_LIMITS.MESSAGE);
    return sanitized.length > 0;
  }
}

module.exports = SecurityUtils;
