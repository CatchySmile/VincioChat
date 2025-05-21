# Vincio Chat

Vincio Chat is a secure, ephemeral web-based chat application that prioritizes privacy and security through zero data retention and end-to-end encryption. Users can create or join chat rooms with unique secure codes, with all communication happening in real-time over WebSockets.

---

## Core Privacy & Security Features

- **Zero Data Retention**
  - All data exists only in memory—no database or persistent storage
  - Messages, user info, and room data are deleted when rooms close or the server restarts
  - No logging of personal data or message content

- **End-to-End Encryption**
  - All messages are end-to-end encrypted in the browser using AES-GCM
  - Encryption keys never leave the client; the server only relays encrypted data
  - Room codes can embed encryption keys for secure sharing

- **Authentication & Protection**
  - Session tokens and CSRF tokens for all sensitive operations
  - Timing-safe comparison for all security tokens to prevent timing attacks
  - Secure random room code generation with high entropy

- **Resource & Abuse Protection**
  - Automatic memory monitoring and graceful degradation under high usage
  - Automatic room cleanup after inactivity
  - Rate limiting for all operations (connections, messages, room creation) to prevent abuse

---

## Communication & User Features

- **Room Management**
  - Create or join rooms with unique 12–24 character alphanumeric codes (optionally with embedded encryption key)
  - Automatic room ownership transfer if owners leave
  - Inactive rooms are cleaned up automatically

- **Real-time Messaging**
  - WebSocket-based messaging via Socket.IO (with polling fallback)
  - Message rate limiting and sanitization
  - Chat commands: `/clear`, `/help`, `/leave`
  - User join/leave notifications and status updates

- **User Experience**
  - Modern dark theme with customizable settings and accent colors
  - Responsive, mobile-friendly design
  - Accessibility with high-contrast options
  - Toast notifications and modals for feedback and actions

---

## Technical Architecture

**Frontend:**
- HTML5, CSS3 (variable-based theming)
- Vanilla JavaScript (ES6+)
- End-to-end encryption using Web Crypto API (AES-GCM)
- Font Awesome & Google Fonts

**Backend:**
- Node.js with Express
- Socket.IO for real-time communication
- Modular architecture: `SocketHandler.js` for all socket events, `RoomManager.js` for room logic, `SecurityUtils.js` for security
- Helmet.js for security headers

**Security:**
- DOMPurify for input sanitization
- Cryptographic token-based authentication
- JSDOM for DOM manipulation
- Comprehensive input validation and adaptive rate limiting

---

## Privacy Approach

- **No Data Storage:** No database, files, or cookies—everything is in-memory
- **Ephemeral Rooms:** Rooms and messages are deleted after inactivity or server restart
- **No User Accounts:** No registration, login, or persistent user data
- **No Tracking:** No analytics or user behavior monitoring
- **Zero Retention:** All data is removed immediately when a room is deleted

---

## Project Structure

```
Project Root/
├── public/                  # Client-side assets
│   ├── styles/              # CSS stylesheets (themes, settings, z-index, etc.)
│   ├── index.html           # Main application HTML (UI, modals, encryption info)
│   ├── app.js               # Frontend logic (encryption, UI, socket events)
│   ├── settings.js          # User settings management
│   ├── loading.js           # Loading screen logic
│   ├── error.html           # Error page
│   └── legal.html           # Legal/privacy policy
│
├── models/                  # Backend data models
│   ├── Room.js              # Room logic and user management
│   ├── RoomManager.js       # Manages active rooms, memory/resource control
│   ├── User.js              # User model with privacy protections
│   └── Message.js           # Message model with sanitization/encryption
│
├── utils/
│   └── SecurityUtils.js     # Security, sanitization, rate limiting, encryption
│
├── server.js                # Main Express + Socket.IO server
├── SocketHandler.js         # WebSocket event handling, auth, CSRF, memory
├── MemoryMonitor.js         # Memory usage monitoring
└── logger.js                # Privacy-focused logging utility
```

---

## Security Features

- **Input Validation & Sanitization**
  - All user inputs (username, room code, messages) are sanitized and size-limited
  - Regex pattern validation for all inputs

- **Rate Limiting**
  - Connection and message rate limiting by IP
  - Room creation limiting
  - Adaptive rate limiting for abuse attempts

- **Session Management**
  - Secure, encrypted session tokens
  - CSRF token implementation
  - Activity tracking and automatic session timeouts

- **Server Hardening**
  - Content Security Policy (CSP)
  - XSS protection with DOMPurify
  - HSTS headers, frame protection, and MIME sniffing prevention

- **End-to-End Encryption**
  - All messages are encrypted in the browser using AES-GCM
  - Encryption keys are never sent to the server
  - Room codes can include the encryption key for secure sharing
  - Server-side encryption for message storage is also supported (configurable)

---

## Installation & Running

1. **Clone the repository:**
    `git clone https://github.com/yourname/VincioChat.git`

2. **Install dependencies:**
    `npm install socket.io uuid express helmet jsdom dompurify`

3. **Start the server:**
    `node server.js`

4. **Open your browser:**
    `localhost:7070`

---

## Development

- Edit CSS variables in `/public/styles/` to customize the theme. sorry about my css skills and formatting.
- Extend Socket.IO event handlers in `SocketHandler.js` for new features
- Update validation and security logic in `utils/SecurityUtils.js`
- Add new models in `/models/` as needed

---

## License

Licensed under the Apache License 2.0. See the LICENSE file for details.

---

## Disclaimer

Vincio Chat is a privacy-focused ephemeral chat system. While strong security measures are implemented, this software is provided "as is" without warranty. Not intended for production use without further security review and hardening.

---

> Built with privacy and security as core principles.
