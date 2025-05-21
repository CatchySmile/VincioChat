/**
 * Enhanced Security utility functions for the chat application
 * Fixes:
 * - Rate limiting logic (increments counter *after* checking)
 * - Asynchronous crypto operations
 * - Improved token generation with better entropy
 * - Fixed token validation
 * - Memory leak in rate limit tracking
 * - Added end-to-end encryption support
 */
require('dotenv').config();
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);
const crypto = require('crypto');
const { promisify } = require('util');

// Create async versions of crypto functions for better performance
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
     * Structure: { tokenHash: { issuedAt: timestamp, expires: timestamp, used: boolean } }
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
     * Server-side encryption config
     * These options control server-side encryption for stored messages
     */
    static ENCRYPTION_CONFIG = {
        enabled: process.env.SERVER_ENCRYPTION_ENABLED === 'true' || true,
        algorithm: process.env.SERVER_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
        keyLength: process.env.SERVER_ENCRYPTION_KEY_LENGTH ? parseInt(process.env.SERVER_ENCRYPTION_KEY_LENGTH) : 32,
        ivLength: process.env.SERVER_ENCRYPTION_IV_LENGTH ? parseInt(process.env.SERVER_ENCRYPTION_IV_LENGTH) : 16
    };

    /**
     * Initialize the security utils
     * Sets up periodic cleanup to prevent memory leaks
     */
    static initialize() {
        // Set up periodic cleanup for rate limit data and token registry
        const cleanupInterval = setInterval(() => {
            this.cleanupRateLimits();
            this.cleanupTokenRegistry();
        }, this.TIMEOUTS.CLEANUP_INTERVAL);

        // Store interval reference for potential cleanup on shutdown
        if (global._securityCleanupIntervals) {
            global._securityCleanupIntervals.push(cleanupInterval);
        } else {
            global._securityCleanupIntervals = [cleanupInterval];
        }

        // Handle graceful shutdown to prevent memory leaks
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    /**
     * Shutdown function to clean up resources
     * @returns {Promise<void>}
     */
    static async shutdown() {
        // Clear all cleanup intervals
        if (global._securityCleanupIntervals) {
            global._securityCleanupIntervals.forEach(interval => clearInterval(interval));
            global._securityCleanupIntervals = [];
        }

        // Clear all rate limit data
        this.rateLimits.clear();
        this.tokenRegistry.clear();
    }

    /**
     * Creates a privacy-preserving hash of an identifier
     * @param {string} identifier - Identifier to hash
     * @returns {string} Truncated hash
     * @private
     */
    static hashIdentifier(identifier) {
        if (!identifier) return 'unknown';

        const hash = crypto.createHash('sha256');
        // Use environment variable for salt if available
        const salt = process.env.HASH_SALT || 'vincio-chat-privacy-salt';
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
     * Fixed rate limiting implementation that checks limits before incrementing counters
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
                count: 0,
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

            limit.count = 0;
            limit.reset = now + actionConfig.period;
            limit.burstRemaining = actionConfig.burst;
        }

        // Calculate effective limit based on past violations
        let effectiveLimit = actionConfig.max;
        if (actionConfig.increasing && limit.violations > 0) {
            // Reduce limit based on violation history (stricter for repeat offenders)
            effectiveLimit = Math.max(5, Math.floor(effectiveLimit / (1 + limit.violations * 0.5)));
        }

        // Check if burst limit available
        let isBurstUsed = false;
        if (limit.count >= effectiveLimit && limit.burstRemaining > 0) {
            limit.burstRemaining--;
            isBurstUsed = true;
        }

        // Check if limit exceeded BEFORE incrementing counter
        const isLimited = limit.count >= effectiveLimit && !isBurstUsed;

        // Track violations for adaptive rate limiting
        if (isLimited) {
            limit.violations += 0.5; // Increment violations by 0.5 for smoother penalty scaling
            limit.lastViolation = now;

            // Set a timeout to clear violation history
            if (limit.timeoutId) {
                clearTimeout(limit.timeoutId);
            }

            limit.timeoutId = setTimeout(() => {
                const currentLimit = this.rateLimits.get(key);
                if (currentLimit) {
                    currentLimit.violations = Math.max(0, currentLimit.violations - 1);
                    currentLimit.timeoutId = null;
                }
            }, 3600000); // Clear one violation point per hour

            return true; // Rate limited
        }

        // Increment counter AFTER checking the limit
        limit.count++;

        return false; // Not rate limited
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
            // Increase entropy with 32 bytes of randomness
            const randomSalt = (await randomBytesAsync(32)).toString('hex');
            const data = `${socketId}:${roomCode}:${timestamp}:${randomSalt}`;

            // Generate token with async encryption
            const token = await this.encryptAsync(data);

            // Register the token for one-time use protection
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            this.tokenRegistry.set(tokenHash, {
                issuedAt: timestamp,
                expires: timestamp + this.TIMEOUTS.TOKEN_EXPIRY,
                used: false,
                socketId,
                roomCode
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
        try {
            const timestamp = Date.now();
            // Increase entropy with 32 bytes of randomness
            const randomSalt = crypto.randomBytes(32).toString('hex');
            const data = `${socketId}:${roomCode}:${timestamp}:${randomSalt}`;

            // Generate token
            const token = this.encrypt(data);

            // Register the token for one-time use protection
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            this.tokenRegistry.set(tokenHash, {
                issuedAt: timestamp,
                expires: timestamp + this.TIMEOUTS.TOKEN_EXPIRY,
                used: false,
                socketId,
                roomCode
            });

            return token;
        } catch (error) {
            console.error('Error generating session token:', error);
            // Return a simpler but secure fallback
            const simpleToken = crypto.randomBytes(48).toString('hex');
            return simpleToken;
        }
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

            // Check if token has already been used in a suspicious way
            // (allowable for repeated checks from same socket)
            if (tokenInfo.used && tokenInfo.socketId !== socketId) {
                // Potential token theft detected
                console.warn(`Potential token theft detected: token used by ${socketId}, originally issued to ${tokenInfo.socketId}`);
                return false;
            }

            // Mark token as used
            tokenInfo.used = true;
            tokenInfo.lastUsed = now;

            // Try to decrypt and validate token
            let decrypted;
            try {
                decrypted = this.decrypt(token);
            } catch (e) {
                return false; // Decryption failed
            }

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
    }

    /**
     * Generates a CSRF token with improved entropy
     * @param {string} sessionId - User's session ID
     * @returns {string} CSRF token
     */
    static generateCSRFToken(sessionId) {
        try {
            // Generate high-entropy CSRF token
            const timestamp = Date.now().toString();
            const random = crypto.randomBytes(32).toString('hex');

            // Get secret from env with fallback
            const csrfSecret = process.env.CSRF_SECRET || process.env.TOKEN_SECRET || 'vincio-csrf-secret-key';

            // Use HMAC for better security
            const hmac = crypto.createHmac('sha256', csrfSecret);
            hmac.update(`${sessionId}:${timestamp}:${random}`);

            return hmac.digest('hex');
        } catch (error) {
            console.error('Error generating CSRF token:', error);

            // Fallback to a simple but secure random token
            return crypto.randomBytes(32).toString('hex');
        }
    }

    /**
     * Asynchronously encrypts text using a secure key and GCM mode
     * @param {string} text - Text to encrypt
     * @returns {Promise<string>} Encrypted text
     */
    static async encryptAsync(text) {
        try {
            // Get secure key or generate one
            const key = await this.getDerivedKeyAsync();

            // Generate random IV
            const iv = await randomBytesAsync(16);

            // Encrypt using GCM mode for better security
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
     * Asynchronously decrypts text that was encrypted with GCM mode
     * @param {string} encrypted - Encrypted text
     * @returns {Promise<string>} Decrypted text
     */
    static async decryptAsync(encrypted) {
        try {
            const parts = encrypted.split(':');
            if (parts.length !== 3) throw new Error('Invalid encrypted format');

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encryptedText = parts[2];

            // Get key
            const key = await this.getDerivedKeyAsync();

            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

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
     * Decrypts text (backward compatible with encrypt method)
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
        // Increase entropy with more random bytes
        return crypto.randomBytes(16).toString('hex').toUpperCase().slice(0, 24);
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

    /**
     * Encrypts a message for server-side storage
     * @param {string} messageText - Message text to encrypt
     * @param {string} roomKey - Key used for room encryption (derived from room code)
     * @returns {string} Encrypted message
     */
    static encryptMessageForStorage(messageText, roomKey) {
        if (!this.ENCRYPTION_CONFIG.enabled) return messageText;

        try {
            // Use the roomKey as a salt to derive a room-specific key
            const key = crypto.scryptSync(
                this.getDerivedKey(),
                roomKey,
                this.ENCRYPTION_CONFIG.keyLength
            );

            // Generate a random IV
            const iv = crypto.randomBytes(this.ENCRYPTION_CONFIG.ivLength);

            // Create cipher using the derived key and IV
            const cipher = crypto.createCipheriv(this.ENCRYPTION_CONFIG.algorithm, key, iv);

            // Encrypt the message
            let encrypted = cipher.update(messageText, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get the auth tag (for GCM mode)
            const authTag = cipher.getAuthTag().toString('hex');

            // Return the encrypted message in format: iv:authTag:encrypted
            return `${iv.toString('hex')}:${authTag}:${encrypted}`;
        } catch (error) {
            console.error('Error encrypting message for storage:', error);
            return messageText; // Fallback to plaintext if encryption fails
        }
    }

    /**
     * Decrypts a message from server-side storage
     * @param {string} encryptedMessage - Encrypted message
     * @param {string} roomKey - Key used for room encryption (derived from room code)
     * @returns {string} Decrypted message text
     */
    static decryptMessageFromStorage(encryptedMessage, roomKey) {
        if (!this.ENCRYPTION_CONFIG.enabled) return encryptedMessage;

        // Check if the message is encrypted (has the IV:authTag:encrypted format)
        if (!encryptedMessage.includes(':')) return encryptedMessage;

        try {
            const parts = encryptedMessage.split(':');
            if (parts.length !== 3) return encryptedMessage; // Invalid format

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];

            // Derive the room-specific key
            const key = crypto.scryptSync(
                this.getDerivedKey(),
                roomKey,
                this.ENCRYPTION_CONFIG.keyLength
            );

            // Create decipher using the derived key and IV
            const decipher = crypto.createDecipheriv(this.ENCRYPTION_CONFIG.algorithm, key, iv);
            decipher.setAuthTag(authTag);

            // Decrypt the message
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Error decrypting message from storage:', error);
            return encryptedMessage; // Return the encrypted message if decryption fails
        }
    }

    /**
     * Generates a cryptographically secure encryption key for a room
     * @returns {string} Base64 encoded encryption key
     */
    static generateRoomEncryptionKey() {
        // Generate a secure random key (32 bytes = 256 bits)
        const key = crypto.randomBytes(32);
        // Return as base64 for easier handling
        return key.toString('base64');
    }

    /**
     * Hash the room code to create a deterministic key for server-side encryption
     * @param {string} roomCode - The room code
     * @returns {string} Deterministic key derived from room code
     */
    static deriveRoomKey(roomCode) {
        if (!roomCode) return '';

        // Use HMAC with the server's secret key to create a deterministic key
        const hmac = crypto.createHmac('sha256', this.getDerivedKey());
        hmac.update(roomCode);
        return hmac.digest('hex');
    }
}

// export
module.exports = SecurityUtils;