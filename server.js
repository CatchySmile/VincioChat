/**
 * Enhanced server with improved security, error handling, and memory management
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const socketIo = require('socket.io');
const helmet = require('helmet');
const RoomManager = require('./models/RoomManager');
const SocketHandler = require('./SocketHandler');
const logger = require('./logger');
const SecurityUtils = require('./utils/SecurityUtils');
const MemoryMonitor = require('./MemoryMonitor');
const path = require('path');
const os = require('os');

// Global memory management configuration
const MEMORY_CONFIG = {
    warningThresholdMb: process.env.MEMORY_WARNING_THRESHOLD || 512, // Warning at 512MB
    criticalThresholdMb: process.env.MEMORY_CRITICAL_THRESHOLD || 768, // Critical at 768MB
    checkIntervalMs: process.env.MEMORY_CHECK_INTERVAL || 60000, // Check every minute
};

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS || "https://vincio.cc",
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
    },
    transports: ['websocket'], // Prefer WebSocket over polling
    allowEIO3: true,
    path: '/socket.io/',
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6, // Limit message size to 1MB
    cookie: {
        name: "vincio_io",
        httpOnly: true,
        secure: true, // Force secure cookies
        sameSite: "strict"
    }
});

// Add debug logging for Socket.IO connections
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(require.resolve('socket.io/client-dist/socket.io.js'));
});

// Add more comprehensive security middleware with Helmet
app.use(helmet());

// Set up Content Security Policy
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "wss:", "ws:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        upgradeInsecureRequests: [],
        blockAllMixedContent: []
    }
}));

// Strict Transport Security
app.use(helmet.hsts({
    maxAge: 63072000, // 2 years in seconds
    includeSubDomains: true,
    preload: true
}));

// Prevent clickjacking
app.use(helmet.frameguard({ action: 'deny' }));

// Prevent MIME type sniffing
app.use(helmet.noSniff());

// XSS protection
app.use(helmet.xssFilter());

// Disable caching for sensitive routes
app.use((req, res, next) => {
    // Skip for static assets that can be cached
    if (req.path.startsWith('/public/') ||
        req.path.startsWith('/styles/') ||
        req.path.includes('.')) {
        return next();
    }

    // Otherwise, apply strict no-cache policy
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Add Referrer-Policy header
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

// Add Permissions-Policy header (we don't need any!)
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', '');
    next();
});

// Enhanced rate limiting middleware for HTTP requests
const httpRateLimit = (req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;

    // Skip rate limiting for static assets
    if (req.path.startsWith('/public/') ||
        req.path.startsWith('/styles/') ||
        req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        return next();
    }

    // Different rate limits based on endpoint type
    let actionType = 'connections';

    // Apply stricter limits for authentication routes
    if (req.path.includes('auth') || req.path.includes('login')) {
        actionType = 'auth';
    }

    // Check rate limiting
    if (clientIp && SecurityUtils.isRateLimited(clientIp, actionType)) {
        logger.warn(`HTTP rate limit exceeded for ${actionType} from IP: ${clientIp}, path: ${req.path}`);

        // Return 429 status with retry-after header
        res.status(429);
        res.setHeader('Retry-After', '60'); // Suggest retry after 60 seconds
        return res.send({
            error: 'Too many requests',
            message: 'Please try again later'
        });
    }

    next();
};

app.use(httpRateLimit);

// Serve static files with proper headers
app.use(express.static('public', {
    setHeaders: (res, path) => {
        // Set cache control for static assets
        res.setHeader('Cache-Control', 'max-age=86400'); // 1 day
    }
}));

// Initialize security utils
SecurityUtils.initialize();

// Initialize room manager
const roomManager = new RoomManager(logger, {
    // Configure room manager
    maxRooms: process.env.MAX_ROOMS || 500,
    maxRoomsPerIp: process.env.MAX_ROOMS_PER_IP || 5,
    roomInactivityTimeout: process.env.ROOM_INACTIVITY_TIMEOUT || 3600000, // 1 hour
    cleanupInterval: process.env.CLEANUP_INTERVAL || 900000, // 15 minutes
    memoryWarningThreshold: MEMORY_CONFIG.warningThresholdMb
});

// Initialize memory monitor
const memoryMonitor = new MemoryMonitor(roomManager, logger, {
    warningThresholdMb: MEMORY_CONFIG.warningThresholdMb,
    criticalThresholdMb: MEMORY_CONFIG.criticalThresholdMb,
    checkIntervalMs: MEMORY_CONFIG.checkIntervalMs
});

// Start memory monitoring
memoryMonitor.start();

// Initialize socket handler with memory monitor
const socketHandler = new SocketHandler(io, roomManager, logger, {
    memoryMonitor: memoryMonitor
});

socketHandler.initialize();

// Limit stats endpoint access to localhost only
app.get('/stats', (req, res) => {
    const allowedIps = ['::1', '127.0.0.1']; // Only allow local access

    if (!allowedIps.includes(req.ip)) {
        logger.warn(`Unauthorized stats access attempt from ${req.ip}`);
        return res.status(403).send('Forbidden');
    }

    // Provide detailed stats for monitoring
    const stats = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            systemTotal: Math.round(os.totalmem() / 1024 / 1024),
            systemFree: Math.round(os.freemem() / 1024 / 1024)
        },
        rooms: roomManager.getStats(),
        connections: {
            current: io.engine.clientsCount,
            sockets: io.sockets.sockets.size
        },
        system: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            cpuCount: os.cpus().length,
            loadAvg: os.loadavg()
        },
        memoryMonitor: memoryMonitor ? memoryMonitor.getStats() : null
    };

    res.json(stats);
});

// Add a health check endpoint
app.get('/health', (req, res) => {
    // Basic health check
    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);

    const memStatus = memoryMonitor ? memoryMonitor.memoryStatus : 'unknown';
    const isMemoryHealthy = memStatus === 'normal' || memStatus === 'warning';

    const health = {
        status: isMemoryHealthy ? 'ok' : 'warning',
        uptime: process.uptime(),
        memoryUsage: heapUsedMb + 'MB',
        memoryStatus: memStatus,
        connections: io.engine.clientsCount,
        rooms: roomManager.getRoomCount(),
        timestamp: new Date().toISOString()
    };

    res.status(isMemoryHealthy ? 200 : 503).json(health);
});

// Ensure socket.io is served from the correct path
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.js'));
});

// Handle all other routes to prevent path traversal
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public/error.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Express error: ${err.message}`);
    res.status(500).sendFile(path.join(__dirname, 'public/error.html'));
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);

    // Close all active sockets
    const sockets = await io.fetchSockets();
    sockets.forEach(socket => {
        socket.emit('error', 'Server is shutting down. Please reconnect in a moment.');
        socket.disconnect(true);
    });

    // Stop memory monitor
    if (memoryMonitor) {
        memoryMonitor.stop();
    }

    // Shutdown room manager
    if (roomManager) {
        await roomManager.shutdown(true);
    }

    // Close the server
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });

    // If server hasn't closed in 10 seconds, force shutdown
    setTimeout(() => {
        logger.error('Server shutdown timeout, forcing exit');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start server on a non-default port
const PORT = process.env.PORT || 7070;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

server.listen(PORT, HOST, () => {
    logger.info(`Server listening on ${HOST}:${PORT}`);
    logger.info(`Memory monitor initialized with warning threshold: ${MEMORY_CONFIG.warningThresholdMb}MB`);
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);

    // Fatal errors should trigger a graceful shutdown
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

// Export for testing
module.exports = { app, server, io, roomManager, memoryMonitor };