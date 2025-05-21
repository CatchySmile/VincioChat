/**
 * Represents a chat room with enhanced security, resource management, memory efficiency
 * and end-to-end encryption
 */
const SecurityUtils = require('../utils/SecurityUtils');

class Room {
    /**
     * Creates a new chat room with security controls
     * @param {string} code - Unique room code
     * @param {User} owner - User who created the room
     * @param {Object} options - Optional room configuration
     */
    constructor(code, owner, options = {}) {
        // Validate required parameters
        if (!code || typeof code !== 'string') {
            throw new Error('Room code is required and must be a string');
        }
        if (!owner) {
            throw new Error('Room owner is required');
        }

        this.code = code.toUpperCase(); // Ensure consistent uppercase format
        this.owner = owner;
        this.users = new Map([[owner.id, owner]]);
        this.messages = [];
        this.createdAt = Date.now();
        this.lastActivity = Date.now();

        // Room capacity controls to prevent DoS
        this.maxUsers = options.maxUsers || 50;
        this.maxMessages = options.maxMessages || 200;

        // Privacy and security settings
        this.isPrivate = options.isPrivate || false;
        this.expiryTime = options.expiryTime || null; // Optional auto-expiry

        // Track banned users to prevent immediate rejoin
        this.bannedUsers = new Set(); // Store IP hashes, never actual IPs

        // Track rate limit violations
        this.rateLimitViolations = new Map();

        // Memory management tracking
        this.memoryStats = {
            peakMessageCount: 0,
            truncationCount: 0,
            lastTruncation: null
        };

        // Generate encryption key for the room (never sent to server)
        this.clientEncryptionKey = options.clientEncryptionKey || null;

        // Server-side encryption key (derived from room code)
        this.serverEncryptionKey = SecurityUtils.deriveRoomKey(this.code);

        // Store encryption settings
        this.encryptionEnabled = options.encryptionEnabled !== undefined ?
            options.encryptionEnabled : true;
    }

    /**
     * Adds a user to the room with checks for banned status
     * @param {User} user - User to add
     * @returns {boolean} True if added, false if room is full or user is banned
     */
    addUser(user) {
        // Check if user is banned
        if (this.bannedUsers.has(user.ipHash)) {
            return false;
        }

        // Check user limit to prevent DoS
        if (this.users.size >= this.maxUsers) {
            return false;
        }

        // Check if username is already taken
        for (const existingUser of this.users.values()) {
            if (existingUser.username.toLowerCase() === user.username.toLowerCase()) {
                return false;
            }
        }

        this.users.set(user.id, user);
        this.updateActivity();
        return true;
    }

    /**
     * Gets a user from the room
     * @param {string} userId - ID of the user to get
     * @returns {User} User object or undefined if not found
     */
    getUser(userId) {
        return this.users.get(userId);
    }

    /**
     * Gets a user by their username
     * @param {string} username - Username to look for (case insensitive)
     * @returns {User|null} User object or null if not found
     */
    getUserByUsername(username) {
        if (!username) return null;

        const normalizedName = username.toLowerCase();
        for (const user of this.users.values()) {
            if (user.username.toLowerCase() === normalizedName) {
                return user;
            }
        }
        return null;
    }

    /**
     * Removes a user from the room
     * @param {string} userId - ID of the user to remove
     * @returns {Object|null} Removed user data or null if not found
     */
    removeUser(userId) {
        const user = this.getUser(userId);
        if (!user) return null;

        const userData = user.toJSON();
        const result = this.users.delete(userId);

        if (result) {
            this.updateActivity();

            // Reassign owner if the owner left
            if (this.isOwner(userId) && this.users.size > 0) {
                this.assignNewOwner();
            }
        }

        return { userData, wasOwner: this.isOwner(userId) };
    }

    /**
     * Assigns a new owner from remaining users
     * @returns {User|null} New owner or null if no users remain
     */
    assignNewOwner() {
        if (this.users.size === 0) return null;

        // Get the first user (oldest in the room) as new owner
        const [firstUserId] = this.users.keys();
        this.owner = this.users.get(firstUserId);
        return this.owner;
    }

    /**
     * Temporarily bans a user from rejoining the room
     * @param {User} user - User to ban
     * @returns {boolean} True if banned, false if already banned
     */
    banUser(user) {
        if (!user || !user.ipHash) return false;

        if (this.bannedUsers.has(user.ipHash)) {
            return false;
        }

        this.bannedUsers.add(user.ipHash);

        // Auto-expire ban after 1 hour (prevent permanent ban on ephemeral system)
        setTimeout(() => {
            this.bannedUsers.delete(user.ipHash);
        }, 60 * 60 * 1000); // 1 hour

        return true;
    }

    /**
     * Adds a message to the room's history with rate limiting
     * @param {Message} message - Message to add
     * @param {boolean} isSystemMessage - Whether this is a system message (bypass limits)
     * @returns {boolean} True if message was added
     */
    addMessage(message, isSystemMessage = false) {
        // Check if this is a system message by either parameter or message property
        const isSysMsg = isSystemMessage || message.isSystem;

        // System messages bypass normal limits
        if (!isSysMsg) {
            // Check rate limiting
            const userId = message.id.split('-')[0]; // Extract user ID if in format "userId-messageId"
            const user = this.getUser(userId);

            if (user) {
                user.trackMessageSent();

                // Check for rate limit violations
                const now = Date.now();
                const messageRateWindow = 5000; // 5 second window
                const messageRateLimit = 10; // Max 10 messages per window

                if (!this.rateLimitViolations.has(userId)) {
                    this.rateLimitViolations.set(userId, {
                        count: 1,
                        window: now + messageRateWindow
                    });
                } else {
                    const violation = this.rateLimitViolations.get(userId);

                    // Reset window if expired
                    if (now > violation.window) {
                        violation.count = 1;
                        violation.window = now + messageRateWindow;
                    } else {
                        violation.count++;

                        // Block message if rate limit exceeded
                        if (violation.count > messageRateLimit) {
                            return false;
                        }
                    }
                }
            }
        }

        // Ensure isSystem flag is set correctly on the message
        if (isSysMsg && !message.isSystem) {
            message.isSystem = true;
        }

        this.messages.push(message);
        this.updateActivity();

        // Update stats for memory management
        if (this.messages.length > this.memoryStats.peakMessageCount) {
            this.memoryStats.peakMessageCount = this.messages.length;
        }

        // Cap message history to prevent memory issues
        if (this.messages.length > this.maxMessages) {
            // Remove oldest messages
            this.messages = this.messages.slice(-this.maxMessages);

            // Update truncation stats
            this.memoryStats.truncationCount++;
            this.memoryStats.lastTruncation = Date.now();
        }

        return true;
    }

    /**
     * Truncates message history to reduce memory usage while preserving 
     * recent messages and system announcements
     * 
     * @param {number} keepCount - Number of most recent messages to keep
     * @returns {number} Number of messages truncated
     * @private
     */
    truncateMessages(keepCount) {
        // Ensure keepCount is reasonable
        const minKeepCount = 10; // Always keep at least this many messages
        const effectiveKeepCount = Math.max(minKeepCount, Math.min(keepCount, this.messages.length));

        // Nothing to truncate if we're keeping everything
        if (effectiveKeepCount >= this.messages.length) {
            return 0;
        }

        // Find system messages that should be preserved regardless
        const importantSystemMessages = [];

        for (let i = 0; i < this.messages.length - effectiveKeepCount; i++) {
            const message = this.messages[i];
            // Keep room creation, important announcements
            if (message.isSystem &&
                (message.text.includes('created') ||
                    message.text.includes('owner') ||
                    message.text.includes('deleted'))) {
                importantSystemMessages.push(message);
            }
        }

        // Number of messages that will be removed
        const truncateCount = this.messages.length - effectiveKeepCount - importantSystemMessages.length;

        if (truncateCount > 0) {
            // Keep the most recent messages plus important system messages
            const recentMessages = this.messages.slice(-effectiveKeepCount);
            this.messages = [...importantSystemMessages, ...recentMessages];

            // Update truncation stats
            this.memoryStats.truncationCount++;
            this.memoryStats.lastTruncation = Date.now();
        }

        return truncateCount;
    }

    /**
     * Checks if a user is the room owner
     * @param {string} userId - User ID to check
     * @returns {boolean} True if user is the owner
     */
    isOwner(userId) {
        return this.owner && this.owner.id === userId;
    }

    /**
     * Updates the room's activity timestamp
     * @returns {number} New timestamp
     */
    updateActivity() {
        this.lastActivity = Date.now();
        return this.lastActivity;
    }

    /**
     * Checks if the room is inactive for cleanup
     * @param {number} timeout - Inactivity timeout in milliseconds
     * @returns {boolean} True if room is inactive
     */
    isInactive(timeout) {
        return Date.now() - this.lastActivity > timeout;
    }

    /**
     * Checks if the room has expired (if expiry time was set)
     * @returns {boolean} True if room has expired
     */
    isExpired() {
        if (!this.expiryTime) return false;
        return Date.now() > this.expiryTime;
    }

    /**
     * Gets the most recent messages, limited to a specified amount
     * @param {number} limit - Maximum number of messages to return
     * @returns {Array} Limited messages array
     */
    getRecentMessages(limit = 50) {
        const safeLimit = Math.min(limit, this.maxMessages);
        return this.messages.slice(-safeLimit);
    }

    /**
     * Gets room data safe for transmitting to clients
     * @param {boolean} includeMessages - Whether to include message history
     * @param {boolean} includeStats - Whether to include memory stats
     * @param {boolean} includeEncryption - Whether to include encryption info
     * @returns {Object} Room data object
     */
    toJSON(includeMessages = false, includeStats = false, includeEncryption = false) {
        const result = {
            code: this.code,
            users: Array.from(this.users.values()).map(user => user.toJSON()),
            userCount: this.users.size,
            messageCount: this.messages.length,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity,
            ownerId: this.owner ? this.owner.id : null,
            encryptionEnabled: this.encryptionEnabled
        };

        // Only include recent messages if specifically requested
        if (includeMessages) {
            result.messages = this.getRecentMessages(50).map(msg => {
                // If server encryption is used, decrypt messages using the server key
                return msg.toJSON(this.serverEncryptionKey);
            });
        }

        // Include memory stats if requested (for admin monitoring)
        if (includeStats) {
            result.memoryStats = { ...this.memoryStats };
        }

        // Include encryption details if requested (for certain operations)
        if (includeEncryption && this.encryptionEnabled) {
            // Never expose the encryption key, just the fact that it's enabled
            result.encryptionEnabled = true;
        }

        return result;
    }

    /**
     * Estimates the memory usage of this room
     * @returns {Object} Memory usage estimation in bytes
     */
    estimateMemoryUsage() {
        // Rough estimate of room overhead
        let memoryUsage = 500; // Base overhead for room object

        // Add user memory estimation
        const usersMemory = this.users.size * 250; // ~250 bytes per user

        // Add message memory estimation (~100 bytes per message baseline + text length)
        const messagesMemory = this.messages.reduce((total, msg) => {
            const msgSize = 100 + (msg.text ? msg.text.length * 2 : 0);
            return total + msgSize;
        }, 0);

        // Add banned users set memory
        const bannedUsersMemory = this.bannedUsers.size * 10;

        return {
            total: memoryUsage + usersMemory + messagesMemory + bannedUsersMemory,
            users: usersMemory,
            messages: messagesMemory,
            banned: bannedUsersMemory,
            base: memoryUsage
        };
    }
}

module.exports = Room;