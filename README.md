# Vincio Chat

Vincio Chat is a secure, ephemeral web-based chat application that prioritizes privacy through zero data retention. Users can create or join chat rooms with unique secure codes, with all communications happening in real-time over WebSockets.

## Core Privacy & Security Features

- **Zero Data Retention**
  - All data exists temporarily in memory only
  - No database or persistent storage of any kind
  - Messages, user information, and room data completely disappear when rooms are deleted or server restarts
  - No logging of personal data, messages, or room information

- **Secure Encryption & Authentication**
  - End-to-end session security with cryptographic tokens
  - CSRF protection for all sensitive operations
  - Timing-safe comparison for all security tokens to prevent timing attacks
  - Secure random room code generation with high entropy

- **Memory Management & Resource Protection**
  - Automatic memory monitoring to prevent resource exhaustion
  - Graceful degradation during high memory usage
  - Automatic room cleanup after inactivity periods
  - Rate limiting for all operations to prevent abuse

## Communication Features

- **Secure Room Management**
  - Create or join rooms with unique 12-24 digit alphanumeric codes
  - Automatic room ownership transfer when owners leave
  - Room cleanup after periods of inactivity
  - Rate limiting on all operations

- **Real-time Communication**
  - WebSocket-based messaging via Socket.IO with polling fallback
  - Message rate limiting and sanitization
  - Support for chat commands (e.g., `/clear`, `/help`, `/leave`)
  - User join/leave notifications and status updates

- **User Experience**
  - Modern dark theme with customizable settings
  - Multiple theme options and accent colors
  - Mobile-friendly responsive design
  - Accessibility considerations with high contrast options

## Technical Architecture

- **Frontend:**
  - HTML5, CSS3 with modern variable-based theming
  - Vanilla JavaScript (ES6+) with no dependencies
  - Font Awesome icons and Google Fonts
  - Responsive design with mobile optimization

- **Backend:**
  - Node.js with Express server
  - Socket.IO for real-time WebSocket communication
  - Modern ES6+ JavaScript
  - Helmet.js for comprehensive security headers

- **Security:**
  - DOMPurify for content sanitization
  - Cryptographic token-based authentication
  - JSDOM for DOM manipulation
  - Comprehensive input validation and rate limiting

## Privacy Approach

All data in Vincio Chat exists only in memory during active sessions:

- **No Data Storage**: No database, no files, no cookies - everything exists only in memory
- **Ephemeral Rooms**: Chat rooms automatically delete after inactivity
- **Memory-Only Messages**: All messages exist only in RAM and disappear when rooms close
- **No User Accounts**: No registration, login, or persistent user data
- **No Tracking**: No analytics, tracking, or user behavior monitoring
- **Zero Retention**: When a room is deleted, all associated data is immediately removed with no backups

## Project Structure

```
Project Root/
├── Public/                  # Client-side assets
│   ├── styles/              # CSS stylesheets
│   │   ├── dark.css         # Base styling
│   │   ├── legal.css        # Legal page styling
│   │   ├── settings.css     # Settings styling
│   │   ├── themes.css       # Theme customization
│   │   └── zbase.css        # Z-index management
│   │ 
│   ├── index.html           # Main application HTML
│   ├── app.js               # Frontend logic
│   ├── settings.js          # Settings management
│   ├── loading.js           # Loading screen
│   ├── error.html           # Error page
│   └── legal.html           # Legal information and privacy policy
│
├── Models/                  # Backend data models
│   ├── Room.js              # Room logic and user management
│   ├── RoomManager.js       # Manages active rooms
│   ├── User.js              # User model with privacy protections
│   └── Message.js           # Message model with sanitization
│
├── Utils/
│   └── SecurityUtils.js     # Security and sanitization utilities
│
├── server.js                # Main Express + Socket.IO server
├── SocketHandler.js         # WebSocket event handling
├── MemoryMonitor.js         # Memory usage monitoring
└── logger.js                # Privacy-focused logging utility
```

## Security Features

- **Input Validation and Sanitization**
  - Content sanitization for all user inputs (username, room code, messages)
  - Size limits to prevent DoS attacks
  - Regex pattern validation for all inputs

- **Rate Limiting**
  - Connection rate limiting by IP address
  - Message rate limiting to prevent spam
  - Room creation limiting
  - Adaptive rate limiting that increases restrictions for abuse attempts

- **Session Management**
  - Secure session tokens with strong encryption
  - CSRF token implementation for all actions
  - Activity tracking for security
  - Automatic session timeouts

- **Server Hardening**
  - Comprehensive Content Security Policy implementation
  - XSS protection with DOMPurify
  - HSTS headers for transport security
  - Frame protection against clickjacking
  - MIME type sniffing prevention

## Installation & Running

1. Clone the repository or extract the zip:
    ```bash
    git clone https://github.com/yourname/VincioChat.git
    ```

2. Install dependencies:
    ```bash
    npm install socket.io uuid express helmet jsdom dompurify
    ```

3. Start the server:
    ```bash
    node server.js
    ```

4. Open your browser and navigate to:
    ```
    http://localhost:7070
    ```

## Development

To modify the application:

1. Edit CSS variables in the styles directory to customize the theme
2. Add new features by extending the Socket.IO event handlers in `SocketHandler.js`
3. Improve security by updating validation in `utils/SecurityUtils.js`
4. Add new models in the `/models` directory as needed

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

## Disclaimer

Vincio Chat is designed as a privacy-focused ephemeral chat system. While we've implemented strong security measures, this software is provided "as is" without warranty. Not intended for production use without further security review and hardening.

---

> Built with privacy and security as core principles.
