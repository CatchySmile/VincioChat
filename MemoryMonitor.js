/**
 * Memory monitoring and management system for Vincio Chat
 * Provides real-time memory usage tracking, automatic cleanup,
 * and emergency measures to prevent out-of-memory crashes
 */
class MemoryMonitor {
    /**
     * Creates a new memory monitor
     * @param {Object} roomManager - Reference to the room manager
     * @param {Object} logger - Logger utility
     * @param {Object} options - Configuration options
     */
    constructor(roomManager, logger, options = {}) {
        this.roomManager = roomManager;
        this.logger = logger;

        // Configuration with defaults
        this.config = {
            checkIntervalMs: options.checkIntervalMs || 60000, // Check every minute
            warningThresholdMb: options.warningThresholdMb || 512, // Warning at 512MB
            criticalThresholdMb: options.criticalThresholdMb || 768, // Critical at 768MB
            emergencyThresholdMb: options.emergencyThresholdMb || 900, // Emergency at 900MB
            inactivityCleanupThresholdMs: options.inactivityCleanupThresholdMs || 3600000, // 1 hour
            lowMemoryInactivityThresholdMs: options.lowMemoryInactivityThresholdMs || 1800000, // 30 minutes
            criticalMemoryInactivityThresholdMs: options.criticalMemoryInactivityThresholdMs || 300000, // 5 minutes
            heapDumpEnabled: options.heapDumpEnabled || false, // Whether to create heap dumps on critical memory
            heapDumpPath: options.heapDumpPath || './heapdumps/' // Where to store heap dumps
        };

        // Memory usage statistics
        this.stats = {
            lastCheck: Date.now(),
            currentUsageMb: 0,
            peakUsageMb: 0,
            warningCount: 0,
            criticalCount: 0,
            emergencyCount: 0,
            lastEmergencyAction: null,
            cleanupCount: 0
        };

        // Monitoring interval ID (for cleanup)
        this.monitorIntervalId = null;

        // Current memory status
        this.memoryStatus = 'normal'; // normal, warning, critical, emergency

        // Heap dump functionality (optional)
        this.heapDump = null;
        if (this.config.heapDumpEnabled) {
            try {
                // Only require heapdump if enabled
                this.heapDump = require('heapdump');

                // Create directory if it doesn't exist
                const fs = require('fs');
                if (!fs.existsSync(this.config.heapDumpPath)) {
                    fs.mkdirSync(this.config.heapDumpPath, { recursive: true });
                }
            } catch (error) {
                this.logger.warn(`Failed to initialize heapdump module: ${error.message}`);
                this.logger.warn('Consider installing heapdump: npm install heapdump');
                this.config.heapDumpEnabled = false;
            }
        }
    }

    /**
     * Check if memory usage is low (normal)
     * @returns {boolean} True if memory is in normal state
     */
    isMemoryLow() {
        // Force a fresh check
        this.checkMemory();

        // Return true if memory is in warning, critical or emergency state
        return this.memoryStatus !== 'normal';
    }

    /**
     * Start monitoring memory usage
     * @returns {Object} This instance for chaining
     */
    start() {
        // Check if already started
        if (this.monitorIntervalId) {
            this.logger.warn('Memory monitor already started');
            return this;
        }

        // Perform initial check
        this.checkMemory();

        // Start regular checks
        this.monitorIntervalId = setInterval(() => {
            this.checkMemory();
        }, this.config.checkIntervalMs);

        this.logger.info('Memory monitoring started');
        return this;
    }

    /**
     * Stop monitoring memory usage
     * @returns {Object} This instance for chaining
     */
    stop() {
        if (this.monitorIntervalId) {
            clearInterval(this.monitorIntervalId);
            this.monitorIntervalId = null;
            this.logger.info('Memory monitoring stopped');
        }
        return this;
    }

    /**
     * Check current memory usage and take action if needed
     */
    checkMemory() {
        const now = Date.now();
        this.stats.lastCheck = now;

        // Get current memory usage
        const memoryUsage = process.memoryUsage();
        const heapUsedMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const rssUsedMb = Math.round(memoryUsage.rss / 1024 / 1024);

        // Use the larger of heap or RSS as current usage
        this.stats.currentUsageMb = Math.max(heapUsedMb, rssUsedMb);

        // Update peak memory usage
        if (this.stats.currentUsageMb > this.stats.peakUsageMb) {
            this.stats.peakUsageMb = this.stats.currentUsageMb;
        }

        // Log basic stats every check
        this.logger.debug(`Memory usage: ${this.stats.currentUsageMb}MB (Peak: ${this.stats.peakUsageMb}MB)`);

        // Update memory status
        const prevStatus = this.memoryStatus;

        // Check thresholds and take appropriate action
        if (this.stats.currentUsageMb >= this.config.emergencyThresholdMb) {
            this.memoryStatus = 'emergency';
            // EMERGENCY: Implement aggressive cleanup to prevent crash
            this.handleEmergencyMemory();
        } else if (this.stats.currentUsageMb >= this.config.criticalThresholdMb) {
            this.memoryStatus = 'critical';
            // CRITICAL: More active memory management needed
            this.handleCriticalMemory();
        } else if (this.stats.currentUsageMb >= this.config.warningThresholdMb) {
            this.memoryStatus = 'warning';
            // WARNING: Memory usage is high but not critical
            this.handleWarningMemory();
        } else {
            this.memoryStatus = 'normal';
            // Normal memory usage, perform standard checks
            this.performStandardCleanup();
        }

        // Log status transitions
        if (prevStatus !== this.memoryStatus) {
            this.logger.info(`Memory status changed: ${prevStatus} -> ${this.memoryStatus}`);
        }

        // Trigger garbage collection explicitly if available
        // This is a hint to the JS engine, not guaranteed
        if (global.gc) {
            try {
                global.gc();
                this.logger.debug('Explicit garbage collection triggered');
            } catch (error) {
                this.logger.error(`Failed to trigger garbage collection: ${error.message}`);
            }
        }
    }

    /**
     * Handle emergency memory situation (prevent crash)
     * @private
     */
    handleEmergencyMemory() {
        this.stats.emergencyCount++;
        this.stats.lastEmergencyAction = Date.now();

        this.logger.error(`EMERGENCY: Memory usage critically high (${this.stats.currentUsageMb}MB). Taking emergency actions.`);

        // Create heap dump if enabled
        if (this.config.heapDumpEnabled && this.heapDump) {
            const dumpPath = `${this.config.heapDumpPath}/emergency-${Date.now()}.heapsnapshot`;
            this.heapDump.writeSnapshot(dumpPath);
            this.logger.warn(`Emergency heap dump created at ${dumpPath}`);
        }

        // Delete ALL inactive rooms regardless of time
        let deletedRooms = 0;
        let deletedMessages = 0;

        // Get all rooms
        const rooms = this.roomManager.getAllRooms();

        // Categorize rooms by activity
        const roomsByActivity = {
            empty: [],
            inactive: [],
            lowActivity: [],
            active: []
        };

        const now = Date.now();

        // Categorize all rooms
        for (const [roomCode, room] of rooms) {
            if (room.users.size === 0) {
                roomsByActivity.empty.push(roomCode);
            } else if (now - room.lastActivity > this.config.criticalMemoryInactivityThresholdMs) {
                roomsByActivity.inactive.push(roomCode);
            } else if (now - room.lastActivity > this.config.lowMemoryInactivityThresholdMs / 2) {
                roomsByActivity.lowActivity.push(roomCode);
            } else {
                roomsByActivity.active.push(roomCode);
            }
        }

        // Delete all empty and inactive rooms immediately
        [...roomsByActivity.empty, ...roomsByActivity.inactive].forEach(roomCode => {
            const room = this.roomManager.getRoom(roomCode);
            if (room) {
                deletedMessages += room.messages.length;
                this.roomManager.deleteRoom(roomCode);
                deletedRooms++;
            }
        });

        // Delete a percentage of low activity rooms if still needed
        if (roomsByActivity.lowActivity.length > 0 && deletedRooms < 10) {
            // Sort by activity time (oldest first)
            roomsByActivity.lowActivity.sort((a, b) => {
                const roomA = this.roomManager.getRoom(a);
                const roomB = this.roomManager.getRoom(b);
                return roomA.lastActivity - roomB.lastActivity;
            });

            // Delete the oldest 50% of low activity rooms
            const toDelete = Math.ceil(roomsByActivity.lowActivity.length * 0.5);
            for (let i = 0; i < toDelete; i++) {
                const roomCode = roomsByActivity.lowActivity[i];
                const room = this.roomManager.getRoom(roomCode);
                if (room) {
                    deletedMessages += room.messages.length;

                    // Notify users in the room before deleting
                    this.roomManager.notifyRoomDeletion(roomCode, 'Emergency server maintenance required. Please rejoin in a few minutes.');

                    this.roomManager.deleteRoom(roomCode);
                    deletedRooms++;
                }
            }
        }

        // As a last resort, if we still need more memory, delete some active rooms
        if (this.stats.currentUsageMb >= this.config.emergencyThresholdMb + 50 && roomsByActivity.active.length > 0) {
            // Sort by message count (largest first)
            roomsByActivity.active.sort((a, b) => {
                const roomA = this.roomManager.getRoom(a);
                const roomB = this.roomManager.getRoom(b);
                return roomB.messages.length - roomA.messages.length;
            });

            // Delete the 25% of active rooms with the most messages
            const toDelete = Math.ceil(roomsByActivity.active.length * 0.25);
            for (let i = 0; i < toDelete; i++) {
                const roomCode = roomsByActivity.active[i];
                const room = this.roomManager.getRoom(roomCode);
                if (room) {
                    deletedMessages += room.messages.length;

                    // Notify users in the room before deleting
                    this.roomManager.notifyRoomDeletion(roomCode, 'Emergency server maintenance required. Please rejoin in a few minutes.');

                    this.roomManager.deleteRoom(roomCode);
                    deletedRooms++;
                }
            }
        }

        // Truncate messages in remaining rooms
        this.truncateAllMessages(75); // Keep only 25% of messages in each room

        this.logger.warn(`Emergency cleanup complete: ${deletedRooms} rooms deleted with ${deletedMessages} messages`);

        // Check memory again after cleanup
        setTimeout(() => this.checkMemory(), 5000);
    }

    /**
     * Handle critical memory situation
     * @private
     */
    handleCriticalMemory() {
        this.stats.criticalCount++;

        this.logger.warn(`CRITICAL: Memory usage high (${this.stats.currentUsageMb}MB). Taking preventive actions.`);

        // Clean up inactive rooms with a shorter threshold
        const deletedRooms = this.cleanupInactiveRooms(this.config.criticalMemoryInactivityThresholdMs);

        // Truncate messages in all rooms to reduce memory footprint
        const truncatedMessages = this.truncateAllMessages(50); // Keep 50% of messages

        this.logger.info(`Critical cleanup complete: ${deletedRooms} rooms deleted, ${truncatedMessages} messages truncated`);

        // Create heap dump if enabled and it's the first critical event
        if (this.config.heapDumpEnabled && this.heapDump && this.stats.criticalCount === 1) {
            const dumpPath = `${this.config.heapDumpPath}/critical-${Date.now()}.heapsnapshot`;
            this.heapDump.writeSnapshot(dumpPath);
            this.logger.info(`Critical heap dump created at ${dumpPath}`);
        }
    }

    /**
     * Handle warning memory situation
     * @private
     */
    handleWarningMemory() {
        this.stats.warningCount++;

        this.logger.warn(`WARNING: Memory usage elevated (${this.stats.currentUsageMb}MB).`);

        // Clean up inactive rooms with a shorter threshold
        const deletedRooms = this.cleanupInactiveRooms(this.config.lowMemoryInactivityThresholdMs);

        // Truncate extra large rooms only
        const truncatedMessages = this.truncateExtraLargeRooms();

        this.logger.info(`Warning cleanup complete: ${deletedRooms} rooms deleted, ${truncatedMessages} messages truncated`);
    }

    /**
     * Perform standard cleanup during normal operation
     * @private
     */
    performStandardCleanup() {
        // Regular maintenance, clean up according to standard thresholds
        const deletedRooms = this.cleanupInactiveRooms(this.config.inactivityCleanupThresholdMs);

        if (deletedRooms > 0) {
            this.stats.cleanupCount++;
            this.logger.info(`Standard cleanup complete: ${deletedRooms} inactive rooms deleted`);
        }
    }

    /**
     * Clean up inactive rooms based on threshold
     * @param {number} inactivityThreshold - Milliseconds of inactivity to consider a room for deletion
     * @returns {number} Number of deleted rooms
     * @private
     */
    cleanupInactiveRooms(inactivityThreshold) {
        let deletedCount = 0;
        const now = Date.now();

        // Get all rooms
        const rooms = this.roomManager.getAllRooms();

        for (const [roomCode, room] of rooms) {
            // Delete if inactive for threshold time or expired
            if ((now - room.lastActivity > inactivityThreshold) || room.isExpired()) {
                this.roomManager.deleteRoom(roomCode);
                deletedCount++;
            }
        }

        return deletedCount;
    }

    /**
     * Truncate messages in all rooms to reduce memory usage
     * @param {number} percentToKeep - Percentage of most recent messages to keep
     * @returns {number} Total number of messages truncated
     * @private
     */
    truncateAllMessages(percentToKeep) {
        // Use the truncateExcessiveMessages method from roomManager if available
        if (typeof this.roomManager.truncateExcessiveMessages === 'function') {
            return this.roomManager.truncateExcessiveMessages(percentToKeep);
        }

        // Fallback implementation if the method is not available
        let totalTruncated = 0;
        const rooms = this.roomManager.getAllRooms();

        for (const [, room] of rooms) {
            if (typeof room.truncateMessages === 'function') {
                const messageCount = room.messages.length;
                const keepCount = Math.max(10, Math.floor(messageCount * percentToKeep / 100));

                if (messageCount > keepCount) {
                    const truncated = room.truncateMessages(keepCount);
                    totalTruncated += truncated;
                }
            }
        }

        return totalTruncated;
    }

    /**
     * Truncate only rooms with excessive message counts
     * @returns {number} Total number of messages truncated
     * @private
     */
    truncateExtraLargeRooms() {
        let totalTruncated = 0;
        const LARGE_ROOM_THRESHOLD = 200; // Rooms with more than 200 messages are considered large

        // Get all rooms
        const rooms = this.roomManager.getAllRooms();

        for (const [, room] of rooms) {
            if (typeof room.truncateMessages === 'function') {
                const messageCount = room.messages.length;

                if (messageCount > LARGE_ROOM_THRESHOLD) {
                    // Keep 75% of messages in large rooms
                    const keepCount = Math.floor(messageCount * 0.75);
                    const truncated = room.truncateMessages(keepCount);
                    totalTruncated += truncated;
                }
            }
        }

        return totalTruncated;
    }

    /**
     * Get current memory statistics
     * @returns {Object} Memory statistics
     */
    getStats() {
        return {
            ...this.stats,
            currentHeapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            currentRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            memoryStatus: this.memoryStatus,
            memoryLimit: {
                warning: this.config.warningThresholdMb,
                critical: this.config.criticalThresholdMb,
                emergency: this.config.emergencyThresholdMb
            },
            uptime: process.uptime(),
            processId: process.pid,
            nodeVersion: process.version
        };
    }
}

module.exports = MemoryMonitor;