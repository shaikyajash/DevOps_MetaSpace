// frontend/src/context/SocketContext.jsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState(new Map());
  const [roomId, setRoomId] = useState(localStorage.getItem("room") || null);
  const [playerName, setPlayerName] = useState(localStorage.getItem("playerName") || "");
  const [hasJoinedRoom, setHasJoinedRoom] = useState(
    localStorage.getItem("hasJoinedRoom") === "true"
  );
  const [messages, setMessages] = useState([]);
  const [nearbyPlayers, setNearbyPlayers] = useState([]);
  
  // Reference to track if we've already joined a room to prevent duplicate joins
  const joinedRoomRef = useRef(null);

  useEffect(() => {
    // Only initialize socket once
    const newSocket = io('http://localhost:3000');

    newSocket.on('connect', () => {
      console.log('Socket.IO connected');
      setIsConnected(true);
      
      // Don't automatically join rooms on connect to prevent duplicate joins
      // Room joining will be handled by explicit joinRoom calls
    });

    newSocket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setIsConnected(false);
    });

    newSocket.on('INIT', (data) => {
      console.log("Received INIT:", data);
      setPlayerId(data.playerId);
    });
    
    newSocket.on('ROOM_PLAYERS', (data) => {
      console.log("Received ROOM_PLAYERS:", data);
      const playerMap = new Map();
      data.players.forEach(player => {
        playerMap.set(player.id, player);
      });
      setPlayers(playerMap);
    });
    
    newSocket.on('PLAYER_JOINED_ROOM', (data) => {
      console.log("Player joined room:", data);
      setPlayers(prevPlayers => {
        const newPlayers = new Map(prevPlayers);
        newPlayers.set(data.player.id, data.player);
        return newPlayers;
      });
    });
    
    newSocket.on('PLAYER_LEFT', (data) => {
      console.log("Player left:", data);
      setPlayers(prevPlayers => {
        const newPlayers = new Map(prevPlayers);
        newPlayers.delete(data.playerId);
        return newPlayers;
      });
      
      // Remove from nearby players if present
      setNearbyPlayers(prev => prev.filter(p => p !== data.playerId));
    });
    
    // Chat message event
    newSocket.on('chat-message', (data) => {
      setMessages(prev => [...prev, {
        sender: data.playerName,
        text: data.message,
        timestamp: Date.now()
      }]);
    });
    
    // Proximity events for video chat
    newSocket.on('player-nearby', (data) => {
      setNearbyPlayers(prev => {
        if (!prev.includes(data.playerId)) {
          return [...prev, data.playerId];
        }
        return prev;
      });
    });
    
    newSocket.on('player-left-proximity', (data) => {
      setNearbyPlayers(prev => prev.filter(p => p !== data.playerId));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []); // Empty dependency array to ensure this only runs once

  // Save room and player name to localStorage
  useEffect(() => {
    if (roomId) {
      localStorage.setItem("room", roomId);
    } else {
      localStorage.removeItem("room");
      joinedRoomRef.current = null; // Reset joined room tracking
    }
  }, [roomId]);

  useEffect(() => {
    if (playerName) {
      localStorage.setItem("playerName", playerName);
    } else {
      localStorage.removeItem("playerName");
    }
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem("hasJoinedRoom", hasJoinedRoom.toString());
  }, [hasJoinedRoom]);

  const value = {
    socket,
    isConnected,
    playerId,
    players,
    roomId,
    playerName,
    hasJoinedRoom,
    messages,
    nearbyPlayers,
    setPlayerName: (name) => {
      console.log("Setting player name:", name);
      setPlayerName(name);
      localStorage.setItem("playerName", name);
      
      if (socket && roomId && hasJoinedRoom) {
        socket.emit('update-player-name', { 
          name, 
          roomId
        });
      }
    },
    setRoomId: (id) => {
      setRoomId(id);
      
      setPlayers(new Map());
      setMessages([]);
      
      if (id) {
        localStorage.setItem("room", id);
      } else {
        localStorage.removeItem("room");
        joinedRoomRef.current = null; // Reset joined room tracking
      }
    },
    joinRoom: (id, name) => {
      // Prevent joining the same room multiple times
      if (joinedRoomRef.current === id) {
        console.log(`Already joined room ${id}, skipping duplicate join`);
        return;
      }
      
      // Update state
      if (id) setRoomId(id);
      if (name) setPlayerName(name);
      
      setHasJoinedRoom(true);
      joinedRoomRef.current = id; // Track which room we've joined
      
      // Reset game state
      setPlayers(new Map());
      setMessages([]);
      
      // Update localStorage
      localStorage.setItem("hasJoinedRoom", "true");
      localStorage.setItem("room", id);
      if (name) localStorage.setItem("playerName", name);
      
      // Only emit if socket is available
      if (socket && id) {
        console.log(`Emitting join-game-room for ${id} as ${name || playerName}`);
        socket.emit('join-game-room', { 
          roomId: id, 
          playerName: name || playerName || "Player"
        });
      }
    },
    leaveRoom: () => {
      // Reset all state
      setHasJoinedRoom(false);
      joinedRoomRef.current = null; // Clear joined room tracking
      
      setRoomId(null);
      setPlayers(new Map());
      setMessages([]);
      setNearbyPlayers([]);
      
      // Clear localStorage
      localStorage.removeItem("room");
      localStorage.setItem("hasJoinedRoom", "false");
      
      // Emit leave event if connected
      if (socket && roomId) {
        socket.emit('leave-game-room', { roomId });
      }
    },
    sendChatMessage: (message) => {
      if (!socket || !roomId || !message.trim()) return;
      
      const chatMessage = {
        roomId,
        message,
        playerName: playerName || "Player"
      };
      
      socket.emit('send-message', chatMessage);
      
      // Add to local messages too
      setMessages(prev => [...prev, {
        sender: "You",
        text: message,
        timestamp: Date.now(),
        isLocal: true
      }]);
    },
    clearMessages: () => {
      setMessages([]);
    },
    emit: (event, data) => {
      if (socket) {
        socket.emit(event, data);
      }
    }
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};