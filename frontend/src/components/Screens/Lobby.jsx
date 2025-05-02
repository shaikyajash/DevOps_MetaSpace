import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../../Context/SocketContext";
import "../../Styles/Lobby.css";

const Lobby = () => {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const { joinRoom } = useSocket();
  const navigate = useNavigate();

  // Load previously used name if available
  useEffect(() => {
    const storedName = localStorage.getItem("playerName");
    if (storedName) {
      setName(storedName);
    }
  }, []);

  const generateRandomRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoom(roomId);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!room.trim() || !name.trim()) {
      alert("Please enter both name and room code");
      return;
    }
    
    // Store name in localStorage for future use
    localStorage.setItem("playerName", name);
    
    // Join room and navigate using both the room ID and username in the URL
    joinRoom(room, name);
    navigate(`/game/${room}/${encodeURIComponent(name)}`);
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1 className="lobby-title">Join a Game Room</h1>
        
        <form onSubmit={handleSubmit} className="lobby-form">
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your display name"
              className="lobby-input"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="room">Room Code</label>
            <div className="room-input-group">
              <input
                type="text"
                id="room"
                name="room"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                className="lobby-input"
              />
              <button 
                type="button" 
                className="random-room-button"
                onClick={generateRandomRoom}
              >
                Random
              </button>
            </div>
          </div>
          
          <button type="submit" className="join-button">Join Room</button>
        </form>
        
        <p className="lobby-info">
          Join an existing room with a code or create a new room
        </p>
      </div>
    </div>
  );
};

export default Lobby;
