# Scratchy Chat

Scratchy Chat is a Node.js memory-only web-based chat room application that allows users to create or join chat rooms using a room code and exchange messages with others. It uses Node.js, Express, and Socket.IO on the backend, and plain JavaScript with HTML/CSS on the frontend.

##  Features

- Create or join rooms with 12-digit codes
- Real-time messaging and room management via WebSockets
- User list display and room ownership
- Responsive UI with modals and toasts
- No permanent data storage — messages live in-memory during the session only temporarily.

##  Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express, Socket.IO
- **Styling:** Custom dark theme with modular SCSS-like variables
- **Communication:** WebSockets via Socket.IO

##  Project Structure

```
Project Root/
├── Public/
│   ├── index.html               # Main HTML file
│   ├── styles.css               # Global styling
│   ├── app.js                   # Frontend logic (Socket.IO client)
│   ├── error.html               # Error endpoint
│   └── law.html                 # Law Enforcement reference page
│
├── Models/
│   ├── Room.js                  # Room logic and user tracking
│   ├── User.js                  # User model
│   └── Message.js               # Message model
│
├── Utils/
│   └── SecurityUtil.js          # Generic Server Security
│
├── server.js                   # Server setup (Express + Socket.IO)
├── SocketHandler.js            # Socket event handling
├── RoomManager.js              # Manages active rooms
└── logger.js                   # Utility logging but this remains for development purposes.

```

##  Installation & Running

1. Clone the repository or extract the zip:
    ```bash
    git clone https://github.com/CatchySmile/ScratchyChat/.git
    ```

2. Install dependencies:
    ```bash
    npm install socket.io
    npm install uuid
    npm install express
    npm install http
    ```

3. Start the server:
    ```bash
    node server.js
    ```

4. Open your browser and navigate to:
    ```
    http://localhost:7070
    ```

##  Privacy & Terms

- No messages or user data, or room information are stored permanently, only in memory or temp logs.
- When a room is deleted all information regarding the room and its contents will immediantly vanish and can not be recovered under any circumstances.

- View full Terms of Service via the in-app modal or /public/legal.html.

---

> Built for fun and experimentation — not for production use.
