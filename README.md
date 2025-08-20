# Tamed Chat Server

Tamed Chat Server is a Node.js server for real-time chat applications with support for text messaging and audio/video calls using WebRTC. It uses [Socket.IO](https://socket.io/) for signaling and message transport, and is designed to work seamlessly with the [Tamed Chat Client](https://www.npmjs.com/package/tamed-chat-client).

## Features

- Real-time text messaging between users
- Audio/Video call signaling using WebRTC (offer/answer/ICE)
- User authentication and session management
- Privacy and call context support
- Scalable and easy to integrate with custom frontends

## Installation

```sh
npm install tamed-chat-server
```

## Usage

```javascript
const { createTamedChatServer } = require('tamed-chat-server');

const server = createTamedChatServer({
  port: 5001,
  authenticateUser: async (credentials) => {
    // Implement your authentication logic here
    // Return user object if valid, or throw error if invalid
    if (credentials.username === 'alice' && credentials.password === 'secret') {
      return { id: 'alice', displayName: 'Alice' };
    }
    throw new Error('Invalid credentials');
  },
  onMessage: (from, to, message) => {
    // Optional: handle or log messages
    console.log(`Message from ${from} to ${to}:`, message);
  },
  onCall: (from, to, callInfo) => {
    // Optional: handle or log call events
    console.log(`Call from ${from} to ${to}:`, callInfo);
  }
});

server.start();
console.log('Tamed Chat Server running on port 5001');
```

## API

### createTamedChatServer(options)

Creates and configures a new chat server.

#### Options

- `port` (number): Port to listen on (default: 5001)
- `authenticateUser` (function): Async function to authenticate users. Receives credentials, returns user object or throws error.
- `onMessage` (function): Optional callback for message events.
- `onCall` (function): Optional callback for call events.

### Server Methods

- `start()`: Starts the server.
- `stop()`: Stops the server.

## Events

- `connection`: Fired when a client connects.
- `disconnect`: Fired when a client disconnects.
- `message`: Fired when a message is received.
- `call`: Fired when a call signaling event occurs.

## Change Log

### 1.0.12
- Tamed Push Service

### 1.0.11

- Privacy added to responses. 

### 1.0.10

- Call Id introduced. 

### 1.0.9

- Ice server privacy fix. 

### 1.0.8

- Text and AV call vector introduced. 

### 1.0.7

- Ice server provider added
- AWS Kinesis TURN info example added in test 

### 1.0.6

- Ice candidate transport added

## License

MIT