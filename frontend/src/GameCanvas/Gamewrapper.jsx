// frontend/src/components/GameWrapper.jsx
import React, { useEffect, useRef } from 'react';
import initGame from './initGame';
import { useSocket } from '../Context/SocketContext';
import { useParams } from 'react-router-dom';

const GameWrapper = () => {
  const { roomId } = useParams();
  const { socket, playerId, playerName, hasJoinedRoom } = useSocket();
  const canvasContainerRef = useRef(null);
  const gameRef = useRef(null);
  const isInitialized = useRef(false);
  
  // Single effect for game initialization
  useEffect(() => {
    // Only initialize if we have all required data and haven't initialized yet
    if (socket && playerId && roomId && hasJoinedRoom && !isInitialized.current) {
      console.log("Initializing game with player name:", playerName, "in room:", roomId);
      
      // Initialize game and store the cleanup function
      const cleanup = initGame(socket, playerId, new Map(), playerName);
      gameRef.current = cleanup;
      isInitialized.current = true;
    }
    
    // Cleanup function
    return () => {
      if (gameRef.current && typeof gameRef.current === 'function') {
        console.log("Cleaning up game instance");
        gameRef.current();
        gameRef.current = null;
      }
      isInitialized.current = false;
    };
  }, [socket, playerId, roomId, hasJoinedRoom, playerName]);

  if (!roomId || !hasJoinedRoom) {
    return (
      <div className="canvas-container loading-container">
        <div className="loading-message">
          {!roomId ? "No room selected." : "Connecting to room..."}
        </div>
      </div>
    );
  }

  return (
    <div ref={canvasContainerRef} className="canvas-container">
      <canvas id="game" />
    </div>
  );
};

export default GameWrapper;