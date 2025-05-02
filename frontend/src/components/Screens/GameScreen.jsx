import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Gamewrapper from "../../GameCanvas/Gamewrapper";
import VideoChat from "../VideoChat/VideoChat";
import { useSocket } from "../../Context/SocketContext";
import "../../Styles/GameScreen.css";

const GameScreen = () => {
  const { roomId, username } = useParams();
  const { socket, joinRoom, setPlayerName } = useSocket();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isNearbyPlayer, setIsNearbyPlayer] = useState(false);
  const messagesContainerRef = useRef(null);
  
  // Flag to track if room joining has been triggered
  const roomJoinedRef = useRef(false);
  
  // Join room only once when component first loads
  useEffect(() => {
    if (!roomId) {
      navigate('/lobby');
      return;
    }
    
    // Join the room only once
    if (!roomJoinedRef.current && socket) {
      // Use username from URL if available, otherwise use stored name
      const playerName = username || localStorage.getItem("playerName") || "Player";
      
      // If username came from URL, make sure to update the context state
      if (username) {
        setPlayerName(username);
      }
      
      joinRoom(roomId, playerName);
      roomJoinedRef.current = true;
    }
  }, [roomId, username, socket, joinRoom, navigate, setPlayerName]);
  
  // Set up socket listeners separately from the join effect
  useEffect(() => {
    if (!socket) return;
    
    // Set up message listener
    const handleChatMessage = (data) => {
      setMessages(prev => [...prev, {
        sender: data.playerName,
        text: data.message,
        isLocal: false
      }]);
    };
    
    // Set up proximity listeners
    const handlePlayerNearby = (data) => {
      console.log("Player nearby: ", data.playerId);
      setIsNearbyPlayer(true);
    };
    
    const handlePlayerLeftProximity = () => {
      setIsNearbyPlayer(false);
    };
    
    // Add listeners
    socket.on('chat-message', handleChatMessage);
    socket.on('player-nearby', handlePlayerNearby);
    socket.on('player-left-proximity', handlePlayerLeftProximity);
    
    // Clean up listeners
    return () => {
      socket.off('chat-message', handleChatMessage);
      socket.off('player-nearby', handlePlayerNearby);
      socket.off('player-left-proximity', handlePlayerLeftProximity);
    };
  }, [socket]);
  
  // Scroll to newest message when messages update
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);
  
  // Send chat message
  const sendMessage = () => {
    if (!messageInput.trim() || !socket) return;
    
    const playerName = localStorage.getItem("playerName") || "Player";
    
    // Send message to server
    socket.emit('send-message', {
      roomId,
      message: messageInput,
      playerName
    });
    
    // Add message to local state
    setMessages(prev => [...prev, {
      sender: 'You',
      text: messageInput,
      isLocal: true
    }]);
    
    // Clear input
    setMessageInput("");
  };

  return (
    <div className="game-screen">
      <div className="game-layout">
        <div className="game-container">
          <Gamewrapper />

          <div className="video-container">
            <VideoChat isNearbyPlayer={isNearbyPlayer} />
          </div>
        </div>

        <div className="chat-sidebar">
          <div className="chat-header">
            <h3>Game Chat - Room: {roomId}</h3>
          </div>

          <div className="chat-messages" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div className="message-placeholder">No messages yet</div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message-bubble ${msg.isLocal ? "sent" : "received"}`}
                >
                  <span className="message-sender">{msg.sender}</span>
                  <p className="message-text">{msg.text}</p>
                </div>
              ))
            )}
          </div>
          
          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="send-button" onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
