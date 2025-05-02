const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const connectDB = require("./config/db");
require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

const { v4: uuidv4 } = require("uuid");

// Import Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");


const app = express();
const server = http.createServer(app);

// Allowed origins
const allowedOrigins = [
  process.env.FRONTEND_URL, // Add your Vercel domain
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
});

// Enabling cors
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified origin: ${origin}`;
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

// Middleware
app.use(express.json());
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON:", err.message);
    return res
      .status(400)
      .json({ message: "Invalid JSON format. Please check your request." });
  }
  next();
});
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes); 
app.use("/api/user", userRoutes);

// Error handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Socket.io connections and logic
const rooms = new Map(); // Map of rooms -> Set of player IDs in that room
const players = new Map(); // Map of player ID -> player data
const PROXIMITY_THRESHOLD = 200; // Distance in pixels to trigger proximity events

// Helper function to calculate distance between two players
function calculateDistance(pos1, pos2) {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
  );
}

// Check if players are in proximity and emit events accordingly
function checkPlayerProximity(playerId, roomId) {
  if (!rooms.has(roomId) || !players.has(playerId)) return;

  const currentPlayer = players.get(playerId);
  const nearbyPlayers = new Set();
  
  // Check distance to all other players in the same room
  for (const otherPlayerId of rooms.get(roomId)) {
    if (otherPlayerId !== playerId && players.has(otherPlayerId)) {
      const otherPlayer = players.get(otherPlayerId);
      const distance = calculateDistance(
        currentPlayer.position,
        otherPlayer.position
      );
      
      if (distance <= PROXIMITY_THRESHOLD) {
        // Players are close to each other
        nearbyPlayers.add(otherPlayerId);
        
        // Notify both players if they weren't already notified
        if (!currentPlayer.nearbyPlayers?.has(otherPlayerId)) {
          // Initialize nearbyPlayers set if it doesn't exist
          if (!currentPlayer.nearbyPlayers) {
            currentPlayer.nearbyPlayers = new Set();
          }
          
          // Add to nearby players and send event
          currentPlayer.nearbyPlayers.add(otherPlayerId);
          io.to(currentPlayer.socketId).emit('player-nearby', { 
            playerId: otherPlayerId,
            position: otherPlayer.position
          });
        }
        
        // Do the same for the other player
        if (!otherPlayer.nearbyPlayers?.has(playerId)) {
          if (!otherPlayer.nearbyPlayers) {
            otherPlayer.nearbyPlayers = new Set();
          }
          
          otherPlayer.nearbyPlayers.add(playerId);
          io.to(otherPlayer.socketId).emit('player-nearby', { 
            playerId,
            position: currentPlayer.position
          });
        }
      } else {
        // Players are not close - check if they were previously nearby
        if (currentPlayer.nearbyPlayers?.has(otherPlayerId)) {
          currentPlayer.nearbyPlayers.delete(otherPlayerId);
          io.to(currentPlayer.socketId).emit('player-left-proximity', { 
            playerId: otherPlayerId 
          });
        }
        
        if (otherPlayer.nearbyPlayers?.has(playerId)) {
          otherPlayer.nearbyPlayers.delete(playerId);
          io.to(otherPlayer.socketId).emit('player-left-proximity', { 
            playerId 
          });
        }
      }
    }
  }
}

io.on('connection', (socket) => {
  console.log('a client connected', socket.id);
  const playerId = uuidv4();
  
  // Initialize player without assigning to a room yet
  players.set(playerId, {
    id: playerId,
    socketId: socket.id,
    position: { x: 0, y: 0 },
    animation: 'down-idle',
    roomId: null,
    name: 'Player',
    nearbyPlayers: new Set()
  });

  // Send only player ID initially
  socket.emit('INIT', {
    playerId
  });

  // Handle room joining for game
  socket.on('join-game-room', (data) => {
    const { roomId, position, animation, playerName } = data;
    console.log(`Player ${playerId} joining room ${roomId} as ${playerName || 'Anonymous'}`);
    
    // Leave previous room if any
    const currentPlayer = players.get(playerId);
    if (currentPlayer && currentPlayer.roomId) {
      const oldRoomId = currentPlayer.roomId;
      leaveRoom(socket, playerId, oldRoomId);
    }
    
    // Update player data
    players.set(playerId, {
      id: playerId,
      socketId: socket.id,
      position: position || { x: 0, y: 0 },
      animation: animation || 'down-idle',
      roomId: roomId,
      name: playerName || 'Player',
      nearbyPlayers: new Set()
    });
    
    // Join socket.io room
    socket.join(roomId);
    
    // Add player to room map
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(playerId);
    
    // Get all players in the room
    const roomPlayers = [];
    if (rooms.has(roomId)) {
      for (const pid of rooms.get(roomId)) {
        if (pid !== playerId) {
          const playerData = players.get(pid);
          if (playerData) {
            roomPlayers.push(playerData);
          }
        }
      }
    }
    
    // Send all room players to newly joined player
    socket.emit('ROOM_PLAYERS', {
      players: roomPlayers,
      roomId: roomId
    });
    
    // Notify other players in the room
    socket.to(roomId).emit('PLAYER_JOINED_ROOM', {
      player: players.get(playerId),
      roomId: roomId
    });
    
    console.log(`Room ${roomId} now has ${rooms.get(roomId).size} players`);
  });

  // Handle player updates
  socket.on('PLAYER_UPDATE', (data) => {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;
    
    // Update player data
    player.position = data.position;
    player.animation = data.animation;
    
    // Check proximity to other players
    checkPlayerProximity(playerId, player.roomId);
    
    // Only broadcast to players in the same room
    socket.to(player.roomId).emit('PLAYER_UPDATED', {
      playerId,
      position: data.position,
      animation: data.animation,
      roomId: player.roomId
    });
  });
  
  // Chat message handling
  socket.on('send-message', (data) => {
    const { roomId, message, playerName } = data;
    if (!roomId || !message) return;
    
    // Broadcast message to all players in the room except sender
    socket.to(roomId).emit('chat-message', {
      playerId,
      playerName: playerName || 'Anonymous',
      message,
      timestamp: Date.now()
    });
  });
  
  // WebRTC signaling
  socket.on('video-offer', (data) => {
    console.log(`Player ${playerId} sent video offer in room ${data.roomId}`);
    const player = players.get(playerId);
    if (!player || !player.roomId) return;
    
    // Get the target player - if a "to" field is provided, send only to that player
    // Otherwise, send to all nearby players
    if (data.to) {
      const targetPlayer = players.get(data.to);
      if (targetPlayer) {
        console.log(`Sending directed video offer to ${data.to}`);
        io.to(targetPlayer.socketId).emit('video-offer', {
          offer: data.offer,
          from: playerId
        });
      }
    } else {
      // Forward the offer to all nearby players
      if (player.nearbyPlayers && player.nearbyPlayers.size > 0) {
        player.nearbyPlayers.forEach((nearbyPlayerId) => {
          const nearbyPlayer = players.get(nearbyPlayerId);
          if (nearbyPlayer) {
            console.log(`Sending video offer from ${playerId} to ${nearbyPlayerId}`);
            io.to(nearbyPlayer.socketId).emit('video-offer', {
              offer: data.offer,
              from: playerId
            });
          }
        });
      }
    }
  });
  
  socket.on('video-answer', (data) => {
    console.log(`Player ${playerId} sent video answer in room ${data.roomId}`);
    
    // Send the answer directly to the specified recipient
    if (data.to) {
      const targetPlayer = players.get(data.to);
      if (targetPlayer) {
        console.log(`Sending directed video answer from ${playerId} to ${data.to}`);
        io.to(targetPlayer.socketId).emit('video-answer', {
          answer: data.answer,
          from: playerId
        });
        return;
      }
    }
    
    // Fallback to sending to all nearby players if no specific target
    const player = players.get(playerId);
    if (!player || !player.roomId) return;
    
    if (player.nearbyPlayers && player.nearbyPlayers.size > 0) {
      player.nearbyPlayers.forEach((nearbyPlayerId) => {
        const nearbyPlayer = players.get(nearbyPlayerId);
        if (nearbyPlayer) {
          console.log(`Sending video answer from ${playerId} to ${nearbyPlayerId}`);
          io.to(nearbyPlayer.socketId).emit('video-answer', {
            answer: data.answer,
            from: playerId
          });
        }
      });
    }
  });
  
  socket.on('ice-candidate', (data) => {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;
    
    // Send to specific recipient if provided
    if (data.to) {
      const targetPlayer = players.get(data.to);
      if (targetPlayer) {
        io.to(targetPlayer.socketId).emit('ice-candidate', {
          candidate: data.candidate,
          from: playerId
        });
        return;
      }
    }
    
    // Otherwise send to all nearby players
    if (player.nearbyPlayers && player.nearbyPlayers.size > 0) {
      player.nearbyPlayers.forEach((nearbyPlayerId) => {
        const nearbyPlayer = players.get(nearbyPlayerId);
        if (nearbyPlayer) {
          io.to(nearbyPlayer.socketId).emit('ice-candidate', {
            candidate: data.candidate,
            from: playerId
          });
        }
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const player = players.get(playerId);
    if (player && player.roomId) {
      leaveRoom(socket, playerId, player.roomId);
    }
    
    // Remove player from players map
    players.delete(playerId);
    console.log('a client disconnected', socket.id);
  });
  
  // Helper function to handle room leaving
  function leaveRoom(socket, pid, roomId) {
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(pid);
      
      // Notify others in the room that this player left
      const player = players.get(pid);
      if (player && player.nearbyPlayers) {
        // Let other players know this player left their proximity
        player.nearbyPlayers.forEach(nearbyPlayerId => {
          const nearbyPlayer = players.get(nearbyPlayerId);
          if (nearbyPlayer) {
            io.to(nearbyPlayer.socketId).emit('player-left-proximity', { 
              playerId: pid 
            });
          }
        });
      }
      
      // If room is empty, remove it
      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} is now empty and removed`);
      } else {
        console.log(`Room ${roomId} now has ${rooms.get(roomId).size} players`);
      }
      
      // Notify others in the room
      socket.to(roomId).emit('PLAYER_LEFT', { playerId: pid });
    }
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));