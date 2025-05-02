// frontend/src/initGame.js
import initKaplay from "./kaplayCtx";

const initGame = (socket, playerId, players, playerName = "") => {
  const DIAGONAL_FACTOR = 1 / Math.sqrt(2);
  const k = initKaplay();
  let mainPlayer = null;
  const otherPlayers = new Map();
  const roomId = localStorage.getItem("room");

  console.log(`Initializing game for player ${playerId} in room ${roomId}`);
  console.log("Initial players:", [...players.entries()]);

  const BACKGROUND_CONFIG = {
    width: 368,
    height: 192,
    scale: 4,
    margin: 20,
  };

  // Generate a spawn position that's a minimum distance from existing players
  const generateSpawnPosition = () => {
    // Available game area
    const minX = BACKGROUND_CONFIG.margin + 50;
    const maxX = (BACKGROUND_CONFIG.width * BACKGROUND_CONFIG.scale) - BACKGROUND_CONFIG.margin - 50;
    const minY = BACKGROUND_CONFIG.margin + 50;
    const maxY = (BACKGROUND_CONFIG.height * BACKGROUND_CONFIG.scale) - BACKGROUND_CONFIG.margin - 50;
    
    // Define minimum distance between players (pixels)
    const MIN_PLAYER_DISTANCE = 150;
    
    // Get existing player positions
    const existingPositions = [];
    otherPlayers.forEach(player => {
      existingPositions.push(player.pos);
    });
    
    // Try to find a suitable position (max 10 attempts)
    for (let i = 0; i < 10; i++) {
      // Generate random position within bounds
      const randomPos = k.vec2(
        k.rand(minX, maxX),
        k.rand(minY, maxY)
      );
      
      // Check if this position is far enough from all other players
      let isFarEnough = true;
      for (const pos of existingPositions) {
        const distance = randomPos.dist(pos);
        if (distance < MIN_PLAYER_DISTANCE) {
          isFarEnough = false;
          break;
        }
      }
      
      if (isFarEnough || existingPositions.length === 0) {
        console.log("Generated spawn position:", randomPos);
        return randomPos;
      }
    }
    
    // If we can't find a position after max attempts, use corners or center with offset
    const positions = [
      k.vec2(minX + 20, minY + 20),           // Top left
      k.vec2(maxX - 20, minY + 20),           // Top right
      k.vec2(minX + 20, maxY - 20),           // Bottom left
      k.vec2(maxX - 20, maxY - 20),           // Bottom right
      k.vec2(k.center().x + 100, k.center().y), // Center right
      k.vec2(k.center().x - 100, k.center().y), // Center left
      k.vec2(k.center().x, k.center().y + 100), // Center bottom
      k.vec2(k.center().x, k.center().y - 100), // Center top
    ];
    
    return positions[Math.floor(k.rand(0, positions.length))];
  };

  // Load sprites with absolute paths
  k.loadSprite("background", "/NewPiskel.png");
  k.loadSprite("characters", "/sprite.png", {
    sliceY: 6,
    sliceX: 6,
    anims: {
      "down-idle": 21,
      "up-idle": 0,
      "right-idle": 24,
      "left-idle": 8,
      right: { from: 25, to: 31, loop: true },
      left: { from: 9, to: 15, loop: true },
      down: { from: 17, to: 23, loop: true },
      up: { from: 1, to: 7, loop: true },
    },
  });

  // Add background
  k.add([k.sprite("background"), k.pos(0, 0), k.scale(BACKGROUND_CONFIG.scale)]);

  const isWithinBounds = (pos) => {
    const minX = BACKGROUND_CONFIG.margin;
    const maxX = (BACKGROUND_CONFIG.width * BACKGROUND_CONFIG.scale) - BACKGROUND_CONFIG.margin;
    const minY = BACKGROUND_CONFIG.margin;
    const maxY = (BACKGROUND_CONFIG.height * BACKGROUND_CONFIG.scale) - BACKGROUND_CONFIG.margin;

    return (
      pos.x >= minX &&
      pos.x <= maxX &&
      pos.y >= minY &&
      pos.y <= maxY
    );
  };

  const createPlayer = (id, initialPos = k.center(), playerName = "") => {
    // Use player name from input or fallback to a shortened ID
    const displayName = playerName || id.substring(0, 5);
    
    const player = k.add([
      k.sprite("characters", { anim: "down-idle" }),
      k.pos(initialPos),
      k.anchor("center"),
      k.scale(0.5),
      {
        playerId: id,
        speed: 300,
        direction: k.vec2(0, 0),
        currentAnim: "down-idle",
        isMovingToTarget: false,
        targetPos: null,
        name: displayName,
      },
      "player"
    ]);
    
    return player;
  };

  // Add a draw function to render all player names
  k.onDraw(() => {
    // Draw player names above all players
    const allPlayers = [...k.get("player")];
    
    allPlayers.forEach(player => {
      // Draw the player's name above them
      if (player.name) {
        // Calculate text width to properly center it
        const textWidth = player.name.length * 8; // rough estimate of text width
        
        k.drawText({
          text: player.name,
          pos: k.vec2(player.pos.x - (textWidth / 2), player.pos.y - 50),
          size: 14,
          font: "sink",
          width: textWidth,
          align: "center",
          color: k.rgb(1, 1, 1), // White text
          outline: { width: 1, color: k.rgb(0, 0, 0) } // Black outline
        });
      }
    });
  });

  const updatePlayerAnimation = (player, direction) => {
    let newAnim = player.currentAnim;

    if (direction.x < 0) newAnim = "left";
    else if (direction.x > 0) newAnim = "right";
    else if (direction.y < 0) newAnim = "up";
    else if (direction.y > 0) newAnim = "down";
    else newAnim = `${player.currentAnim.split('-')[0]}-idle`;

    if (newAnim !== player.currentAnim) {
      player.play(newAnim);
      player.currentAnim = newAnim;
    }
  };

  const emitUpdate = (position, animation) => {
    socket?.emit('PLAYER_UPDATE', {
      position,
      animation,
      roomId
    });
  };

  const setupPlayerControls = (player) => {
    let lastEmitTime = 0;
    const EMIT_INTERVAL = 10; // ms
    let lastSentPos = null;
    let lastSentAnim = null;
  
    const throttledEmitUpdate = (position, animation) => {
      const now = Date.now();
      const positionChanged = !lastSentPos || !position.eq(lastSentPos);
      const animChanged = animation !== lastSentAnim;
  
      if ((positionChanged || animChanged) && now - lastEmitTime >= EMIT_INTERVAL) {
        emitUpdate(position, animation);
        lastEmitTime = now;
        lastSentPos = position.clone();
        lastSentAnim = animation;
      }
    };
  
    k.onClick(() => {
      if (!player) return;
  
      const mousePos = k.mousePos();
      const worldPos = k.toWorld(mousePos);
  
      if (isWithinBounds(worldPos)) {
        player.targetPos = worldPos;
        player.isMovingToTarget = true;
      }
    });
  
    k.onUpdate(() => {
      if (!player) return;
      
      // No need to track previous position for name tag updates
      player.prevPos = player.pos.clone();
      const prevAnim = player.currentAnim;
  
      if (k.isKeyPressed("left") || k.isKeyPressed("right") || k.isKeyPressed("up") || k.isKeyPressed("down")) {
        player.isMovingToTarget = false;
        player.targetPos = null;
      }
  
      player.direction.x = 0;
      player.direction.y = 0;
  
      if (k.isKeyDown("left")) player.direction.x -= 1;
      if (k.isKeyDown("right")) player.direction.x += 1;
      if (k.isKeyDown("up")) player.direction.y -= 1;
      if (k.isKeyDown("down")) player.direction.y += 1;
  
      if (player.direction.len() !== 0) {
        if (player.direction.x !== 0 && player.direction.y !== 0) {
          player.direction = player.direction.unit().scale(player.speed * DIAGONAL_FACTOR * k.dt());
        } else {
          player.direction = player.direction.unit().scale(player.speed * k.dt());
        }
        player.pos = player.pos.add(player.direction);
      } else if (player.isMovingToTarget && player.targetPos) {
        const direction = player.targetPos.sub(player.pos);
        const distance = direction.len();
  
        if (distance < 2) {
          player.isMovingToTarget = false;
          player.targetPos = null;
        } else {
          const step = direction.unit().scale(player.speed * k.dt());
          player.pos = player.pos.add(step);
          player.direction = direction.unit();
        }
      }
  
      updatePlayerAnimation(player, player.direction);
      throttledEmitUpdate(player.pos, player.currentAnim);
    });
  };
  

  const setupCamera = (player) => {
    k.onUpdate(() => {
      if (!player) return;
      const targetY = player.pos.y - 100;
      const currentPos = k.camPos();
      const smoothness = 0.1;

      k.camPos(
        k.lerp(currentPos.x, player.pos.x, smoothness),
        k.lerp(currentPos.y, targetY, smoothness)
      );
    });
  };

  socket?.on('PLAYER_JOINED_ROOM', (data) => {
    console.log("Player joined room event:", data);
    if (data.roomId === roomId) {
      console.log(`Creating remote player ${data.player.id} in room ${data.roomId} with name ${data.player.name}`);
      // Use the provided position if available, otherwise generate a new position
      const playerPosition = (data.player.position && data.player.position.x) 
        ? k.vec2(data.player.position.x, data.player.position.y)
        : generateSpawnPosition();
        
      const remotePlayer = createPlayer(
        data.player.id,
        playerPosition,
        data.player.name
      );
      otherPlayers.set(data.player.id, remotePlayer);
    }
  });

  socket?.on('ROOM_PLAYERS', (data) => {
    console.log("Room players event:", data);
    if (data.roomId === roomId) {
      otherPlayers.forEach(player => player.destroy());
      otherPlayers.clear();
      
      data.players.forEach(playerData => {
        if (playerData.id !== playerId) {
          console.log(`Adding existing room player ${playerData.id}`);
          // Use the provided position if available, otherwise generate a new position
          const playerPosition = (playerData.position && playerData.position.x) 
            ? k.vec2(playerData.position.x, playerData.position.y) 
            : generateSpawnPosition();
            
          const remotePlayer = createPlayer(
            playerData.id,
            playerPosition,
            playerData.name
          );
          otherPlayers.set(playerData.id, remotePlayer);
        }
      });
    }
  });

  socket?.on('PLAYER_UPDATED', (data) => {
    if (data.roomId === roomId) {
      const player = otherPlayers.get(data.playerId);
      if (player) {
        player.pos = k.vec2(data.position.x, data.position.y);
        
        if (player.currentAnim !== data.animation) {
          player.play(data.animation);
          player.currentAnim = data.animation;
        }
      }
    }
  });

  socket?.on('PLAYER_LEFT', (data) => {
    console.log("Player left event:", data);
    const player = otherPlayers.get(data.playerId);
    if (player) {
      console.log(`Removing player ${data.playerId}`);
      player.destroy();
      otherPlayers.delete(data.playerId);
    }
  });

  // Initialize main player
  if (playerId) {
    // Get name from localStorage if available
    const storedName = localStorage.getItem("playerName") || playerName;
    mainPlayer = createPlayer(playerId, generateSpawnPosition(), storedName);
    setupPlayerControls(mainPlayer);
    setupCamera(mainPlayer);
    
    // Join room with current player
    if (roomId) {
      socket?.emit('join-game-room', { 
        roomId, 
        position: { x: mainPlayer.pos.x, y: mainPlayer.pos.y },
        animation: mainPlayer.currentAnim,
        playerName: storedName
      });
    }
  }

  // Return cleanup function
  return () => {
    if (mainPlayer) {
      mainPlayer.destroy();
    }
    otherPlayers.forEach(player => {
      player.destroy();
    });
    otherPlayers.clear();
    
    // Remove socket listeners
    socket?.off('PLAYER_JOINED_ROOM');
    socket?.off('ROOM_PLAYERS');
    socket?.off('PLAYER_UPDATED');
    socket?.off('PLAYER_LEFT');
  };
};

export default initGame;