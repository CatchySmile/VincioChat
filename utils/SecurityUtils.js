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
   * Rate limit constants with adaptive scaling
   */
  static RATE_LIMIT = {
    MESSAGES: { 
      max: 30,           // Base limit: 30 messages per minute
      period: 60000,     // 1 minute in milliseconds
      burst: 6,         // Allow bursts of 6 messages
      increasing: true   // Allow increasing penalty for repeated violations
    },
    CONNECTIONS: { 
      max: 15, 
      period: 60000,
      burst: 5,
      increasing: true
    },
    ROOMS: { 
      max: 5, 
      period: 180000,    // 3 minutes
      burst: 2,
      increasing: false
    }
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
   * Enhanced sanitization for text inputs with additional security checks
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
    
    // Remove control characters and zero-width characters
    sanitized = sanitized.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
    
    // Use DOMPurify with stricter configuration
    return DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [], // No attributes allowed
      KEEP_CONTENT: true, // Keep the text content
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link'],
      FORBID_ATTR: ['style', 'onerror', 'onload', 'onmouseover', 'onmouseout', 'onclick'],
      ALLOW_DATA_ATTR: false, // Prevent data-* attributes
      ADD_URI_SAFE_ATTR: false // No additional URI safe attributes
    });
  }

  /**
   * Detects potentially malicious content patterns
   * @param {string} text - Text to check
   * @returns {boolean} True if suspicious patterns detected
   */
  static detectSuspiciousContent(text) {
    if (!text) return false;
    
    // Check for script injection attempts
    const scriptPattern = /<script|javascript:|data:text\/html|vbscript:|livescript:|<\/script>/i;
    if (scriptPattern.test(text)) return true;
    
    // Check for CSS injection attempts
    const cssPattern = /<style|expression\s*\(|@import|behavior:/i;
    if (cssPattern.test(text)) return true;
    
    // Check for iframe and object injection
    const framePattern = /<iframe|<object|<embed|<frame|<frameset/i;
    if (framePattern.test(text)) return true;
    
    // Check for excessive use of symbols (potential DoS)
    const symbolRatio = (text.match(/[^\w\s]/g) || []).length / text.length;
    if (symbolRatio > 0.4 && text.length > 20) return true;
    
    // Check for excessively long words (potential DoS)
    const longestWordLength = Math.max(...text.split(/\s+/).map(word => word.length), 0);
    if (longestWordLength > 50) return true;
    
    return false;
  }

  /**
   * Enhanced rate limiting with burst allowance and adaptive penalties
   * @param {string} ip - IP address of the client
   * @param {string} action - Action type (messages, connections, rooms)
   * @returns {boolean} True if rate limited, false otherwise
   */
  static isRateLimited(ip, action) {
    const now = Date.now();
    const key = `${ip}:${action}`;
    const actionConfig = this.RATE_LIMIT[action.toUpperCase()];
    
    if (!actionConfig) {
      return false; // Unknown action type, don't rate limit
    }
    
    if (!this.rateLimits.has(key)) {
      // Initialize new rate limit entry
      this.rateLimits.set(key, {
        count: 1,
        reset: now + actionConfig.period,
        violations: 0,
        lastViolation: 0,
        burstRemaining: actionConfig.burst
      });
      return false;
    }
    
    const limit = this.rateLimits.get(key);
    
    // Reset counter if period has passed
    if (now >= limit.reset) {
      // Reduce violation count over time (forgiveness factor)
      if (limit.violations > 0 && now - limit.lastViolation > 3600000) { // 1 hour
        limit.violations = Math.max(0, limit.violations - 1);
      }
      
      limit.count = 1;
      limit.reset = now + actionConfig.period;
      limit.burstRemaining = actionConfig.burst;
      return false;
    }
    
    // Increment counter
    limit.count++;
    
    // Calculate effective limit based on past violations
    let effectiveLimit = actionConfig.max;
    if (actionConfig.increasing && limit.violations > 0) {
      // Reduce limit based on violation history (stricter for repeat offenders)
      effectiveLimit = Math.max(5, Math.floor(effectiveLimit / (1 + limit.violations * 0.5)));
    }
    
    // Check if burst limit available
    if (limit.count > effectiveLimit && limit.burstRemaining > 0) {
      limit.burstRemaining--;
      return false;
    }
    
    // Check if limit exceeded
    const exceeded = limit.count > effectiveLimit + limit.burstRemaining;
    
    // Track violations for adaptive rate limiting
    if (exceeded) {
      limit.violations++;
      limit.lastViolation = now;
      
      // Log the violation for analysis
      console.warn(`Rate limit exceeded for ${action} from hidden IP Violation count: ${limit.violations}`);
    }
    
    // Clean up old entries occasionally
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
    return /^[A-Za-z0-9]+$/.test(code) && 
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
   * Validates message content with enhanced security checks
   * @param {string} message - Message to validate
   * @returns {boolean} True if valid, false otherwise
   */
  static isValidMessage(message) {
    if (!message || typeof message !== 'string') return false;
    
    // Check message length
    if (message.length === 0 || message.length > this.SIZE_LIMITS.MESSAGE) return false;
    
    // Check for suspicious content patterns
    if (this.detectSuspiciousContent(message)) return false;
    
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
    return crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 12);
  }
}

module.exports = SecurityUtils;
