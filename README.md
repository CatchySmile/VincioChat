# Scratchy Chat

Scratchy Chat is a secure, ephemeral web-based chat application that allows users to create or join chat rooms using WebSockets . Built with privacy in mind, it stores all data temporarily in memory and we have a zero log & zero data retention design.
## Features

- **Secure Room Management**
  - Create or join rooms with unique 12-digit alphanumeric codes
  - Automatic room ownership transfer when owners leave
  - Room cleanup after periods of inactivity
  - Rate limiting on everything *practical*.

- **Real-time Communication**
  - WebSocket-based messaging via Socket.IO with polling fallback
  - Message rate limiting and sanitization
  - Support for simple chat commands (e.g., `/clear`, `/help`, `/leave`)
  - User join/leave notifications and status updates

- **Privacy-Focused Design**
  - No permanent data storage, all information exists only in memory
  - No logs of personal data, messages, or room information.
  - Messages and room data disappear when rooms are deleted
  - No cookies or user tracking in any form.

- **Responsive UI**
  - Modern dark theme with customizable CSS variables
  - Mobile-friendly design with touch optimization
  - Accessibility considerations with contrasting colors
  - Toast notifications and modal dialogs for better UX

## Technologies Used

- **Frontend:**
  - HTML5, CSS3
  - Vanilla JavaScript (ES6+)
  - Font Awesome icons and Google Fonts

- **Backend:**
  - Node.js with Express server
  - Socket.IO for real-time WebSocket communication
  - Modern ES6+ JavaScript
  - Helmet for security headers

- **Security:**
  - DOMPurify for sanitization
  - Cryptography
  - JSDOM for DOM manipulation in Node.js
  - More stuff down below.

## Project Structure

```
Project Root/
├── Public/
│   ├── Public/
│   │   ├── dark.css             # Global CSS styling
│   │   ├── legal.css            # Legal Page CSS styling
│   │   ├── settings.css         # Settings CSS styling
│   │   ├── themes.css           # Theme CSS styling
│   │   └── zbase.css            # Inline CSS styling
│   │ 
│   ├── index.html               # Main application HTML
│   ├── app.js                   # Frontend logic (Socket.IO client)
│   ├── error.html               # Error page endpoint
│   └── legal.html               # Legal information and privacy policy
│
├── Models/
│   ├── Room.js                  # Room logic and user management
│   ├── RoomManager.js           # Manages active rooms
│   ├── User.js                  # User model
│   └── Message.js               # Message model
│
├── Utils/
│   └── SecurityUtils.js         # Security utilities and sanitization
│
├── server.js                    # Main server setup (Express + Socket.IO)
├── SocketHandler.js             # Socket event handling
└── logger.js                    # Secure logging utility
```

## Security Features

- **Input Validation and Sanitization**
  - Username, room code, and message content sanitization
  - Size limits on all inputs
  - Regex pattern validation for allowed characters

- **Rate Limiting**
  - Connection rate limiting by IP address
  - Message rate limiting to prevent spam
  - Room creation limiting to prevent abuse

- **Session Management**
  - Secure session tokens with encryption
  - CSRF token implementation
  - Activity tracking and timeout management

- **Server Hardening**
  - Content Security Policy implementation
  - XSS filters and protections
  - HSTS headers for transport security
  - Frame protection against clickjacking
  - MIME type sniffing prevention

## Installation & Running

1. Clone the repository or extract the zip:
    ```bash
    git clone https://github.com/CatchySmile/ScratchyChat.git
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

1. Edit CSS variables in `public/styles.css` to customize the theme
2. Add new features by extending the Socket.IO event handlers in `SocketHandler.js`
3. Improve security by updating validation in `utils/SecurityUtils.js`
4. Add new models in the `/models` directory as needed

## Privacy & Terms

- No messages, user data, or room information are stored permanently
- All data exists only in memory during active sessions
- When a room is deleted, all associated information is immediately removed
- No logging of personally identifiable information

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

## Acknowledgements

- Socket.IO team for the real-time WebSocket library
- Express.js team for the web server framework
- DOMPurify for security sanitization
- Font Awesome for UI icons

---

> Built with security and privacy as core principles. Not intended for production use without further hardening.
