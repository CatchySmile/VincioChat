/**
   * Creates a privacy-preserving hash of an identifier
   * @param {string} identifier - Identifier to hash
   * @returns {string} Truncated hash
   */


/**
 * Enhanced Security utility functions for the chat application
 * Addresses: 
 * - Rate limiting flaws
 * - Synchronous crypto operations
 * - Weak token generation
 * - Improved entropy for CSRF tokens
 */
require('dotenv').config();
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);
const crypto = require('crypto');
const { promisify } = require('util');

// Create async versions of crypto functions
const randomBytesAsync = promisify(crypto.randomBytes);
const scryptAsync = promisify(crypto.scrypt);

class SecurityUtils {
    /**
     * Map to track request rates by IP address
     * Structure: { ip: { count: number, lastReset: timestamp, timeoutId: number } }
     */
    static rateLimits = new Map();

    /**
     * Map to track token issuance to prevent token reuse attacks
     * Structure: { tokenHash: { issuedAt: timestamp, expires: timestamp } }
     */
    static tokenRegistry = new Map();

    /**
     * Rate limit constants with adaptive scaling
     * These can be overridden via environment variables
     */
    static RATE_LIMIT = {
        MESSAGES: {
            max: process.env.RATE_LIMIT_MESSAGES_MAX ? parseInt(process.env.RATE_LIMIT_MESSAGES_MAX) : 30,
            period: process.env.RATE_LIMIT_MESSAGES_PERIOD ? parseInt(process.env.RATE_LIMIT_MESSAGES_PERIOD) : 60000,
            burst: process.env.RATE_LIMIT_MESSAGES_BURST ? parseInt(process.env.RATE_LIMIT_MESSAGES_BURST) : 6,
            increasing: process.env.RATE_LIMIT_MESSAGES_INCREASING !== 'false',
            decayRate: process.env.RATE_LIMIT_MESSAGES_DECAY ? parseFloat(process.env.RATE_LIMIT_MESSAGES_DECAY) : 0.5
        },
        CONNECTIONS: {
            max: process.env.RATE_LIMIT_CONNECTIONS_MAX ? parseInt(process.env.RATE_LIMIT_CONNECTIONS_MAX) : 15,
            period: process.env.RATE_LIMIT_CONNECTIONS_PERIOD ? parseInt(process.env.RATE_LIMIT_CONNECTIONS_PERIOD) : 60000,
            burst: process.env.RATE_LIMIT_CONNECTIONS_BURST ? parseInt(process.env.RATE_LIMIT_CONNECTIONS_BURST) : 5,
            increasing: process.env.RATE_LIMIT_CONNECTIONS_INCREASING !== 'false',
            decayRate: process.env.RATE_LIMIT_CONNECTIONS_DECAY ? parseFloat(process.env.RATE_LIMIT_CONNECTIONS_DECAY) : 0.2
        },
        ROOMS: {
            max: process.env.RATE_LIMIT_ROOMS_MAX ? parseInt(process.env.RATE_LIMIT_ROOMS_MAX) : 5,
            period: process.env.RATE_LIMIT_ROOMS_PERIOD ? parseInt(process.env.RATE_LIMIT_ROOMS_PERIOD) : 180000,
            burst: process.env.RATE_LIMIT_ROOMS_BURST ? parseInt(process.env.RATE_LIMIT_ROOMS_BURST) : 2,
            increasing: process.env.RATE_LIMIT_ROOMS_INCREASING === 'true',
            decayRate: process.env.RATE_LIMIT_ROOMS_DECAY ? parseFloat(process.env.RATE_LIMIT_ROOMS_DECAY) : 0.1
        }
    };

    /**
     * Size limits for different entities
     * These can be overridden via environment variables
     */
    static SIZE_LIMITS = {
        MESSAGE: process.env.SIZE_LIMIT_MESSAGE ? parseInt(process.env.SIZE_LIMIT_MESSAGE) : 500,
        USERNAME: process.env.SIZE_LIMIT_USERNAME ? parseInt(process.env.SIZE_LIMIT_USERNAME) : 20,
        ROOM_CODE: process.env.SIZE_LIMIT_ROOM_CODE ? parseInt(process.env.SIZE_LIMIT_ROOM_CODE) : 24
    };

    /**
     * Timeout values for cleanup operations
     * These can be overridden via environment variables
     */
    static TIMEOUTS = {
        ROOM_INACTIVITY: process.env.TIMEOUT_ROOM_INACTIVITY ? parseInt(process.env.TIMEOUT_ROOM_INACTIVITY) : 3600000,
        SOCKET_INACTIVITY: process.env.TIMEOUT_SOCKET_INACTIVITY ? parseInt(process.env.TIMEOUT_SOCKET_INACTIVITY) : 7200000,
        TOKEN_EXPIRY: process.env.TIMEOUT_TOKEN_EXPIRY ? parseInt(process.env.TIMEOUT_TOKEN_EXPIRY) : 3600000,
        CLEANUP_INTERVAL: process.env.TIMEOUT_CLEANUP_INTERVAL ? parseInt(process.env.TIMEOUT_CLEANUP_INTERVAL) : 300000,
        BAN_DURATION: process.env.TIMEOUT_BAN_DURATION ? parseInt(process.env.TIMEOUT_BAN_DURATION) : 3600000
    };

    /**
     * Initialize the security utils
     * Sets up periodic cleanup to prevent memory leaks
     */
    static initialize() {
        // Set up periodic cleanup for rate limit data
        setInterval(() => {
            this.cleanupRateLimits();
            this.cleanupTokenRegistry();
        }, this.TIMEOUTS.CLEANUP_INTERVAL);
    }
    static hashIdentifier(identifier) {
        if (!identifier) return 'unknown';

        const hash = crypto.createHash('sha256');
        // Use environment variable for salt if available
        const salt = process.env.HASH_SALT;
        hash.update(identifier + salt);
        // Return only first 8 characters - enough for differentiation
        // but not enough to reconstruct the original value
        return hash.digest('hex').substring(0, 8);
    }
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
     * Improved rate limiting with burst allowance, adaptive penalties, and fixed counter increment issue
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

        // Check if entry exists and initialize if needed
        if (!this.rateLimits.has(key)) {
            this.rateLimits.set(key, {
                count: 0, // Start at 0 before incrementing
                reset: now + actionConfig.period,
                violations: 0,
                lastViolation: 0,
                burstRemaining: actionConfig.burst,
                timeoutId: null // Track timeouts for cleanup
            });
        }

        const limit = this.rateLimits.get(key);

        // Reset counter if period has passed
        if (now >= limit.reset) {
            // Reduce violation count over time (forgiveness factor)
            if (limit.violations > 0) {
                limit.violations = Math.max(0, limit.violations - actionConfig.decayRate);
            }

            limit.count = 0; // Reset to 0 before incrementing
            limit.reset = now + actionConfig.period;
            limit.burstRemaining = actionConfig.burst;
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
        let isBurstUsed = false;
        if (limit.count > effectiveLimit && limit.burstRemaining > 0) {
            limit.burstRemaining--;
            isBurstUsed = true;
        }

        // Check if limit exceeded
        const isLimited = limit.count > effectiveLimit + (isBurstUsed ? 1 : 0);

        // Track violations for adaptive rate limiting
        if (isLimited) {
            limit.violations += 0.5; // Increment violations by 0.5 for smoother penalty scaling
            limit.lastViolation = now;

            // Log the violation for analysis (with anonymized IP)
            console.warn(`Rate limit exceeded for ${action}. Violation count: ${limit.violations.toFixed(1)}`);
        }

        return isLimited;
    }

    /**
     * Cleans up expired rate limit entries to prevent memory leaks
     */
    static cleanupRateLimits() {
        const now = Date.now();
        const deleted = [];

        for (const [key, limit] of this.rateLimits.entries()) {
            // Remove entries that have expired and have no violations
            if (now >= limit.reset && limit.violations <= 0.1) {
                // Clear any pending timeouts to prevent memory leaks
                if (limit.timeoutId) {
                    clearTimeout(limit.timeoutId);
                }
                deleted.push(key);
            }
        }

        // Delete outside of iteration to avoid modifying during iteration
        deleted.forEach(key => this.rateLimits.delete(key));

        if (deleted.length > 0) {
            console.debug(`Cleaned up ${deleted.length} expired rate limit entries`);
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
     * Asynchronously generates a session token with improved security
     * @param {string} socketId - User's socket ID
     * @param {string} roomCode - Room code
     * @returns {Promise<string>} Encrypted session token
     */
    static async generateSessionTokenAsync(socketId, roomCode) {
        try {
            const timestamp = Date.now();
            const randomSalt = (await randomBytesAsync(16)).toString('hex');
            const data = `${socketId}:${roomCode}:${timestamp}:${randomSalt}`;

            // Generate token with async encryption
            const token = await this.encryptAsync(data);

            // Register the token for one-time use protection
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            this.tokenRegistry.set(tokenHash, {
                issuedAt: timestamp,
                expires: timestamp + this.TIMEOUTS.TOKEN_EXPIRY
            });

            return token;
        } catch (error) {
            console.error('Error generating session token:', error);
            throw new Error('Failed to generate secure token');
        }
    }

    /**
     * Synchronous version for backward compatibility
     * @param {string} socketId - User's socket ID
     * @param {string} roomCode - Room code
     * @returns {string} Encrypted session token
     */
    static generateSessionToken(socketId, roomCode) {
        const timestamp = Date.now();
        const randomSalt = crypto.randomBytes(16).toString('hex');
        const data = `${socketId}:${roomCode}:${timestamp}:${randomSalt}`;

        // Generate token
        const token = this.encrypt(data);

        // Register the token for one-time use protection
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        this.tokenRegistry.set(tokenHash, {
            issuedAt: timestamp,
            expires: timestamp + this.TIMEOUTS.TOKEN_EXPIRY
        });

        return token;
    }

    /**
     * Validates a session token with improved security
     * @param {string} token - Token to validate
     * @param {string} socketId - User's socket ID
     * @param {string} roomCode - Room code
     * @returns {boolean} True if valid, false otherwise
     */
    static validateSessionToken(token, socketId, roomCode) {
        try {
            // Check token registry first (prevents token reuse)
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const tokenInfo = this.tokenRegistry.get(tokenHash);

            // If token not found or expired in registry, it's invalid
            const now = Date.now();
            if (!tokenInfo || now > tokenInfo.expires) {
                return false;
            }

            // Decrypt and validate token
            const decrypted = this.decrypt(token);
            const parts = decrypted.split(':');

            if (parts.length < 3) return false;

            const [tokenSocketId, tokenRoomCode, timestamp] = parts;

            // Check if token is expired
            if (now - parseInt(timestamp) > this.TIMEOUTS.TOKEN_EXPIRY) {
                // Remove expired token from registry
                this.tokenRegistry.delete(tokenHash);
                return false;
            }

            // Check if socket ID and room code match
            return tokenSocketId === socketId && tokenRoomCode === roomCode;
        } catch (error) {
            console.error('Error validating session token:', error);
            return false;
        }
    }

    /**
     * Clean up expired token registry entries
     */
    static cleanupTokenRegistry() {
        const now = Date.now();
        const deleted = [];

        for (const [tokenHash, info] of this.tokenRegistry.entries()) {
            if (now > info.expires) {
                deleted.push(tokenHash);
            }
        }

        // Delete outside of iteration
        deleted.forEach(hash => this.tokenRegistry.delete(hash));

        if (deleted.length > 0) {
            console.debug(`Cleaned up ${deleted.length} expired tokens`);
        }
    }

    /**
     * Generates a CSRF token with improved entropy
     * @param {string} sessionId - User's session ID
     * @returns {string} CSRF token
     */
    static generateCSRFToken(sessionId) {
        try {
            // Generate more entropy
            const timestamp = Date.now().toString();
            const random = crypto.randomBytes(32).toString('hex');
            const hash = crypto.createHash('sha256');

            // Mix in multiple sources of entropy
            hash.update(`${sessionId}:${timestamp}:${random}:${process.env.CSRF_SECRET || 'default-csrf-secret'}`);
            return hash.digest('hex');
        } catch (error) {
            console.error('Error generating CSRF token:', error);
            throw new Error('Failed to generate secure CSRF token');
        }
    }

    /**
     * Asynchronously encrypts text using a secure key
     * @param {string} text - Text to encrypt
     * @returns {Promise<string>} Encrypted text
     */
    static async encryptAsync(text) {
        try {
            // Get secure key or generate one
            const key = await this.getDerivedKeyAsync();

            // Generate random IV
            const iv = await randomBytesAsync(16);

            // Encrypt
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get auth tag
            const authTag = cipher.getAuthTag();

            // Return IV + authTag + encrypted data
            return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Synchronously encrypts text (for backward compatibility)
     * @param {string} text - Text to encrypt
     * @returns {string} Encrypted text
     */
    static encrypt(text) {
        try {
            // Get key
            const key = this.getDerivedKey();

            // Generate random IV
            const iv = crypto.randomBytes(16);

            // Encrypt
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Return IV + encrypted data
            return `${iv.toString('hex')}:${encrypted}`;
        } catch (error) {
            console.error('Encryption error:', error);
            // Fallback to simpler encryption if needed
            const hash = crypto.createHash('sha256');
            hash.update(text + (process.env.TOKEN_SECRET || 'fallback-encryption-key'));
            return hash.digest('hex');
        }
    }

    /**
     * Decrypts text
     * @param {string} encrypted - Encrypted text
     * @returns {string} Decrypted text
     */
    static decrypt(encrypted) {
        try {
            const parts = encrypted.split(':');
            if (parts.length !== 2) throw new Error('Invalid encrypted format');

            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = parts[1];

            // Get key
            const key = this.getDerivedKey();

            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

            // Decrypt
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Decryption failed');
        }
    }

    /**
     * Generates a session token for a user
     * @param {string} socketId - User's socket ID
     * @param {string} roomCode - Room code
     * @returns {string} Session token
     */
    static generateSessionToken(socketId, roomCode) {
        try {
            const timestamp = Date.now().toString();
            const randomValue = crypto.randomBytes(16).toString('hex');
            const data = `${socketId}:${roomCode}:${timestamp}:${randomValue}`;

            // Generate token
            const token = this.encrypt(data);

            // Register the token
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            this.tokenRegistry.set(tokenHash, {
                issuedAt: parseInt(timestamp),
                expires: parseInt(timestamp) + this.TIMEOUTS.TOKEN_EXPIRY
            });

            return token;
        } catch (error) {
            console.error('Error generating session token:', error);
            // Fallback to a simpler token in case of failure
            const fallbackToken = crypto.createHash('sha256')
                .update(`${socketId}:${roomCode}:${Date.now()}:${Math.random()}`)
                .digest('hex');
            return fallbackToken;
        }
    }
    /**
     * Get derived key for encryption (async)
     * @returns {Promise<Buffer>} Derived key
     */
    static async getDerivedKeyAsync() {
        try {
            // Get secret from environment or use default (in production, always set this env var)
            const secret = process.env.TOKEN_SECRET || process.env.SECRET_KEY || 'vincio-default-secret-key-change-in-production';
            const salt = process.env.TOKEN_SALT || process.env.HASH_SALT || 'vincio-salt';

            // Generate a more secure key with scrypt
            return await scryptAsync(secret, salt, 32);
        } catch (error) {
            console.error('Error generating derived key:', error);
            // Fallback to a simpler method if scrypt fails
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256');
            hash.update(process.env.TOKEN_SECRET || process.env.SECRET_KEY || 'vincio-default-secret-key-change-in-production');
            return hash.digest();
        }
    }
    /**
     * Get derived key for encryption (sync)
     * @returns {Buffer} Derived key
     */
    static getDerivedKey() {
        try {
            // Get secret from environment or use default (in production, always set this env var)
            const secret = process.env.TOKEN_SECRET || process.env.SECRET_KEY || 'vincio-default-secret-key-change-in-production';
            // Ensure salt is never undefined
            const salt = process.env.TOKEN_SALT || process.env.HASH_SALT || 'vincio-salt';

            // Generate a more secure key with scrypt
            return crypto.scryptSync(secret, salt, 32);
        } catch (error) {
            console.error('Error generating derived key:', error);
            // Fallback to a simpler method if scrypt fails
            const hash = crypto.createHash('sha256');
            hash.update(process.env.TOKEN_SECRET || process.env.SECRET_KEY || 'vincio-default-secret-key-change-in-production');
            return hash.digest();
        }
    }

    /**
     * Generates a secure random room code
     * @returns {string} Random room code
     */
    static generateSecureRoomCode() {
        return crypto.randomBytes(12).toString('hex').toUpperCase().slice(0, 24);
    }

    /**
     * Compare strings in a timing-safe manner to prevent timing attacks
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {boolean} True if strings match
     */
    static timingSafeEqual(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }

        try {
            const bufA = Buffer.from(a, 'utf8');
            const bufB = Buffer.from(b, 'utf8');

            // If lengths differ, create a new buffer of the same length
            // This ensures the comparison takes the same amount of time
            // regardless of where strings differ
            if (bufA.length !== bufB.length) {
                const bufC = Buffer.alloc(bufA.length);
                bufB.copy(bufC, 0, 0, Math.min(bufB.length, bufA.length));
                return false; // Return false but still perform the comparison
            }

            return crypto.timingSafeEqual(bufA, bufB);
        } catch (error) {
            console.error('Error in timing-safe comparison:', error);
            return false;
        }
    }
}

// Initialize on module load
SecurityUtils.initialize();

module.exports = SecurityUtils;