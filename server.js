/**
 * Enhanced server with security improvements
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

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins in development
    methods: ["GET", "POST"],
    credentials: true
  },
  // Allow both polling and websocket for better compatibility
  transports: ['polling', 'websocket'],
  // Enable EIO version 3 for compatibility
  allowEIO3: true
});

app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(require.resolve('socket.io/client-dist/socket.io.js'));
});

// Add security middleware with Helmet
app.use(helmet());

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
    styleSrc: ["'self'", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "wss:", "ws:"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: []
  }
}));

// Use other security headers
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.hsts({
  maxAge: 15552000, // 180 days in seconds
  includeSubDomains: true,
  preload: true
}));

// Rate limiting middleware for HTTP requests
const httpRateLimit = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Skip rate limiting for static assets
  if (req.path.startsWith('/public/') || 
      req.path.startsWith('/styles/') || 
      req.path.startsWith('/public/')) {
    return next();
  }
  
  // Check rate limiting
  if (clientIp && require('./utils/SecurityUtils').isRateLimited(clientIp, 'connections')) {
    logger.warn(`HTTP rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).send('Too Many Requests');
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

// Initialize room manager
const roomManager = new RoomManager(logger);

// Initialize socket handler
const socketHandler = new SocketHandler(io, roomManager, logger);
socketHandler.initialize();

// Limit stats endpoint access to localhost only
app.get('/stats', (req, res) => {
  const allowedIps = ['::1', '127.0.0.1']; // Only allow local access
  
  if (!allowedIps.includes(req.ip)) {
    logger.warn(`Unauthorized stats access attempt from ${req.ip}`);
    return res.status(403).send('Forbidden');
  }
  
  // Provide minimal stats to reduce information disclosure
  res.json({
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Ensure socket.io is served from the correct path
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js');
});

// Handle all other routes to prevent path traversal
app.use((req, res, next) => {
  res.status(404).sendFile(__dirname + '/public/error.html');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // If server hasn't closed in 10 seconds, force shutdown
  setTimeout(() => {
    logger.error('Server shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);
});

// Start server on a non-default port
const PORT = process.env.PORT || 7070;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

server.listen(PORT, HOST, () => {
  logger.info(`Server listening on ${HOST}:${PORT}`);
});

// Export for testing
module.exports = { app, server, io };
