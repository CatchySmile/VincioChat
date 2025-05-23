// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'vincio-chat',
    script: 'server.js',
    cwd: '/home/vincio/vincio-chat',
    instances: 1, // Single instance for memory-based chat
    exec_mode: 'fork',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      PORT: 7070
    },
    
    // Memory and CPU limits
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    
    // Logging
    log_file: '/home/vincio/logs/vincio-chat.log',
    out_file: '/home/vincio/logs/vincio-chat-out.log',
    error_file: '/home/vincio/logs/vincio-chat-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Process management
    autorestart: true,
    watch: false, // Don't watch in production
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Resource monitoring
    monitoring: false, // Set to true if you want PM2 monitoring
    
    // Additional settings for memory-based app
    instance_var: 'INSTANCE_ID',
    combine_logs: true,
    merge_logs: true
  }]
};