# Scratchy Chat

Scratchy Chat is a real-time web-based chat room application that allows users to create or join chat rooms using a room code and exchange messages with others. It uses Node.js, Express, and Socket.IO on the backend, and plain JavaScript with HTML/CSS on the frontend.

## 🚀 Features

- Create or join rooms with 12-digit codes
- Real-time messaging via WebSockets
- User list display and room ownership
- Responsive UI with modals and toasts
- No permanent data storage — messages live in-memory during the session only and they are temporary.

## 🧩 Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express, Socket.IO
- **Styling:** Custom dark theme with modular SCSS-like variables
- **Communication:** WebSockets via Socket.IO

## 🛠 Project Structure

```
├── index.html            # Main HTML file
├── styles.css            # Global styling
├── app.js                # Frontend logic (Socket.IO client)
├── server.js             # Server setup (Express + Socket.IO)
├── SocketHandler.js      # Socket event handling
├── RoomManager.js        # Manages active rooms
├── Room.js               # Room logic and user tracking
├── User.js               # User model
├── Message.js            # Message model
├── logger.js             # Utility logging
```

## 📦 Installation & Running

1. Clone the repository or extract the zip:
    ```bash
    git clone https://github.com/your-username/scratchy-chat.git
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Start the server:
    ```bash
    node server.js
    ```

4. Open your browser and navigate to:
    ```
    http://localhost:3000
    ```

## 🛡 Privacy & Terms

- No messages or user data are stored permanently.
- Disconnecting clears your presence and chat history.
- View full Terms of Service via the in-app modal.

---

> Built for fun and experimentation — not for production use.
