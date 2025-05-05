/**
 * Enhanced Security utility functions for the chat application
 */
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);
const crypto = require('crypto');

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
   * Timeout values for cleanup operations
   */
  static TIMEOUTS = {
    ROOM_INACTIVITY: 3600000, // 1 hour
    SOCKET_INACTIVITY: 7200000, // 2 hours
    TOKEN_EXPIRY: 86400000 // 24 hours
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
    return DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [], // No attributes allowed
      KEEP_CONTENT: true // Keep the text content
    });
  }

  /**
   * Checks if a request is rate limited
   * @param {string} ip - IP address of the client
   * @param {string} action - Action type (messages, connections, rooms)
   * @returns {boolean} True if rate limited, false otherwise
   */
  static isRateLimited(ip, action) {
    const now = Date.now();
    const key = `${ip}:${action}`;
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, {
        count: 1,
        reset: now + this.RATE_LIMIT[action.toUpperCase()].period
      });
      return false;
    }
    
    const limit = this.rateLimits.get(key);
    
    // Reset counter if period has passed
    if (now >= limit.reset) {
      limit.count = 1;
      limit.reset = now + this.RATE_LIMIT[action.toUpperCase()].period;
      return false;
    }
    
    // Increment counter
    limit.count++;
    
    // Check if limit exceeded
    const exceeded = limit.count > this.RATE_LIMIT[action.toUpperCase()].max;
    
    // Clean up old entries every 100 checks (approximately)
    if (Math.random() < 0.01) {
      this.cleanupRateLimits();
    }
    
    return exceeded;
  }
  
  /**
   * Cleans up expired rate limit entries
   */
  static cleanupRateLimits() {
    const now = Date.now();
    for (const [key, limit] of this.rateLimits.entries()) {
      if (now >= limit.reset) {
        this.rateLimits.delete(key);
      }
    }
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
    return sanitized.length > 0 && /^[a-zA-Z0-9_]+$/.test(sanitized);
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

  /**
   * Generates a session token for a user
   * @param {string} socketId - User's socket ID
   * @param {string} roomCode - Room code
   * @returns {string} Encrypted session token
   */
  static generateSessionToken(socketId, roomCode) {
    const timestamp = Date.now();
    const data = `${socketId}:${roomCode}:${timestamp}`;
    return this.encrypt(data, process.env.TOKEN_SECRET || 'default-secret-key');
  }

  /**
   * Validates a session token
   * @param {string} token - Token to validate
   * @param {string} socketId - User's socket ID
   * @param {string} roomCode - Room code
   * @returns {boolean} True if valid, false otherwise
   */
  static validateSessionToken(token, socketId, roomCode) {
    try {
      const decrypted = this.decrypt(token, process.env.TOKEN_SECRET || 'default-secret-key');
      const [tokenSocketId, tokenRoomCode, timestamp] = decrypted.split(':');
      
      // Check if token is expired
      const now = Date.now();
      if (now - parseInt(timestamp) > this.TIMEOUTS.TOKEN_EXPIRY) return false;
      
      // Check if socket ID and room code match
      return tokenSocketId === socketId && tokenRoomCode === roomCode;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generates a CSRF token for the user session
   * @param {string} sessionId - User's session ID
   * @returns {string} CSRF token
   */
  static generateCSRFToken(sessionId) {
    const timestamp = Date.now().toString();
    const hash = crypto.createHash('sha256');
    hash.update(`${sessionId}:${timestamp}:${process.env.CSRF_SECRET || 'default-csrf-secret'}`);
    return hash.digest('hex');
  }

  /**
   * Validates a CSRF token
   * @param {string} token - Token to validate
   * @param {string} sessionId - User's session ID
   * @param {string} storedToken - Stored token to compare against
   * @returns {boolean} True if valid, false otherwise
   */
  static validateCSRFToken(token, sessionId, storedToken) {
    return token === storedToken;
  }

  /**
   * Simple encryption function
   * @param {string} text - Text to encrypt
   * @param {string} key - Encryption key
   * @returns {string} Encrypted text
   */
  static encrypt(text, key) {
    // Use modern crypto methods
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', 
      crypto.createHash('sha256').update(key).digest().slice(0, 32), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Simple decryption function
   * @param {string} encrypted - Encrypted text
   * @param {string} key - Decryption key
   * @returns {string} Decrypted text
   */
  static decrypt(encrypted, key) {
    try {
      const parts = encrypted.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc',
        crypto.createHash('sha256').update(key).digest().slice(0, 32), iv);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generates a secure random room code
   * @returns {string} Random room code
   */
  static generateSecureRoomCode() {
    return crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 12);
  }
}

module.exports = SecurityUtils;
