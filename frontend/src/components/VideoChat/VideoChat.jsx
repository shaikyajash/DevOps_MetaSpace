import React, { useRef, useEffect, useState, useCallback } from "react";
import { useSocket } from "../../Context/SocketContext";
import "../../Styles/VideoChat.css";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ],
};

function VideoChat({ isNearbyPlayer }) {
  const { socket, roomId, playerId } = useSocket();
  const pcRef = useRef(null);
  const remotePeerIdRef = useRef(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // Added state for connecting indicator
  const [offerSent, setOfferSent] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  // Ref to track initialization to prevent multiple setups
  const isInitializedRef = useRef(false);
  const pendingCandidatesRef = useRef([]);
  // Store the previous nearby state to detect changes - Removed, simplified logic

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  // Process any queued ICE candidates
  const processPendingCandidates = useCallback(() => {
    if (!pcRef.current || !pcRef.current.remoteDescription || pendingCandidatesRef.current.length === 0) return;
    
    console.log(`Processing ${pendingCandidatesRef.current.length} pending ICE candidates`);
    
    pendingCandidatesRef.current.forEach(async (candidate) => {
      try {
        await pcRef.current.addIceCandidate(candidate);
      } catch (err) {
        console.warn("Could not apply pending ICE candidate:", err);
      }
    });
    
    pendingCandidatesRef.current = [];
  }, []);
  
  // Set up local media stream
  const setupLocalStream = useCallback(async () => {
    if (localStream) return localStream;
    
    try {
      console.log("Setting up local media stream");
      const constraints = {
        video: { 
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30 }
        },
        audio: true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(e => console.log("Play silently failed:", e));
      }
      
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      return null;
    }
  }, [localStream]);

  // Clean up resources when component unmounts or players move away
  const cleanUp = useCallback(() => {
    console.log("Cleaning up WebRTC resources");
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped local ${track.kind} track`);
      });
      setLocalStream(null);
    }
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
      // Ensure video element is visually reset
      remoteVideoRef.current.style.opacity = "0";
      remoteVideoRef.current.style.visibility = "hidden";
    }
    
    setIsConnected(false);
    setIsConnecting(false); // Reset connecting state
    setOfferSent(false);
    remotePeerIdRef.current = null;
    isInitializedRef.current = false; // Reset initialization flag
    setConnectionAttempts(0); // Reset connection attempts
    pendingCandidatesRef.current = []; // Clear pending candidates
  }, [localStream]);

  // Set up peer connection and add local stream
  const setupPeerConnection = useCallback(async () => {
    if (pcRef.current) return pcRef.current;
    
    console.log("Creating new RTCPeerConnection with ICE servers:", ICE_SERVERS);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    
    // Set up media stream if not already set up
    const stream = await setupLocalStream();
    if (!stream) return pc;
    
    // Add tracks to peer connection
    stream.getTracks().forEach(track => {
      console.log("Adding local track to peer connection:", track.kind);
      pc.addTrack(track, stream);
    });
    
    // Set up event handlers
    pc.ontrack = (event) => {
      console.log("Remote track received:", event);
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        const remoteStream = event.streams[0]; // Store the stream
        console.log("Setting remote stream to video element");
        remoteVideoRef.current.srcObject = remoteStream;
        
        // Ensure video element is ready for playback attempts
        remoteVideoRef.current.style.display = "block";
        remoteVideoRef.current.muted = false; // Unmute remote video
        remoteVideoRef.current.autoplay = true;
        remoteVideoRef.current.playsInline = true;
        remoteVideoRef.current.style.opacity = "0"; // Start hidden
        remoteVideoRef.current.style.visibility = "hidden";

        // Enhanced play logic with better error handling and visibility checks
        const attemptPlay = (attempt = 0) => {
          if (!remoteVideoRef.current || !remoteVideoRef.current.srcObject) {
            console.log("AttemptPlay: Remote video ref or srcObject missing.");
            setIsConnecting(false); // Stop showing connecting indicator
            return;
          }

          // Check if video is already playing
          if (!remoteVideoRef.current.paused && remoteVideoRef.current.readyState >= 3) {
             console.log("Remote video already playing.");
             remoteVideoRef.current.style.opacity = "1";
             remoteVideoRef.current.style.visibility = "visible";
             setIsConnected(true); // Ensure connected state is true
             setIsConnecting(false);
             return;
          }

          console.log(`Attempting to play remote video (Attempt ${attempt + 1})`);
          remoteVideoRef.current.play()
            .then(() => {
              console.log("Remote video play() promise resolved.");
              // Double-check playback state after a short delay
              setTimeout(() => {
                if (remoteVideoRef.current && !remoteVideoRef.current.paused && remoteVideoRef.current.readyState >= 3) {
                  console.log("Remote video playback confirmed.");
                  remoteVideoRef.current.style.opacity = "1";
                  remoteVideoRef.current.style.visibility = "visible";
                  setIsConnected(true); // Ensure connected state is true
                  setIsConnecting(false);
                } else {
                  console.warn("Remote video play() resolved but playback not confirmed.");
                  // Retry if needed
                  if (attempt < 5 && remoteVideoRef.current) {
                     setTimeout(() => attemptPlay(attempt + 1), 500 * Math.pow(2, attempt));
                  } else {
                     setIsConnecting(false); // Stop showing connecting after max retries
                  }
                }
              }, 100); // Short delay to check actual playback state
            })
            .catch(e => {
              console.error(`Remote video play attempt ${attempt + 1} failed:`, e);
              // Retry with exponential backoff up to 5 attempts
              if (attempt < 5 && remoteVideoRef.current) {
                setTimeout(() => attemptPlay(attempt + 1), 500 * Math.pow(2, attempt));
              } else {
                 console.error("Max play attempts reached or video element removed.");
                 setIsConnecting(false); // Stop showing connecting indicator
              }
            });
        };
        
        // Start attempting to play after a short delay
        setTimeout(() => attemptPlay(), 200);
      } else {
         console.warn("ontrack event received, but remoteVideoRef or streams are invalid.");
         setIsConnecting(false);
      }
    };
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && remotePeerIdRef.current) {
        console.log("Sending ICE candidate to:", remotePeerIdRef.current);
        socket.emit("ice-candidate", {
          roomId,
          candidate: event.candidate,
          from: playerId,
          to: remotePeerIdRef.current
        });
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      if (!pcRef.current) return; // Check if pc exists
      const currentState = pcRef.current.iceConnectionState;
      console.log("ICE connection state:", currentState);

      switch (currentState) {
        case 'checking':
          setIsConnecting(true);
          setIsConnected(false); // Ensure isConnected is false while checking
          break;
        case 'connected':
        case 'completed':
          setIsConnected(true); // Explicitly set connected true
          setIsConnecting(false); // Explicitly set connecting false
          setConnectionAttempts(0); // Reset attempts on success
          // Ensure video plays if it hasn't already
          if (remoteVideoRef.current && remoteVideoRef.current.paused) {
             console.log("ICE connected, attempting to play paused video.");
             // Use the attemptPlay logic to handle potential playback issues
             const attemptPlay = (attempt = 0) => {
                if (!remoteVideoRef.current) return;
                remoteVideoRef.current.play()
                  .then(() => {
                      console.log("Retry play successful.");
                      remoteVideoRef.current.style.opacity = "1";
                      remoteVideoRef.current.style.visibility = "visible";
                  })
                  .catch(e => {
                      console.warn(`Retry play attempt ${attempt + 1} failed:`, e);
                      if (attempt < 3) { // Limit retries here
                          setTimeout(() => attemptPlay(attempt + 1), 300);
                      }
                  });
             };
             attemptPlay();
          }
          break;
        case 'disconnected':
          setIsConnected(false);
          setIsConnecting(true); // May try to reconnect, show indicator
          console.warn("ICE disconnected. Attempting to reconnect...");
          // Consider initiating reconnection logic here if needed
          break;
        case 'failed':
          setIsConnected(false);
          setIsConnecting(false);
          console.error("ICE connection failed.");
          // Optionally trigger cleanup or retry after delay
          cleanUp(); // Clean up on failure to allow restart
          break;
        case 'closed':
          setIsConnected(false);
          setIsConnecting(false);
          // Connection is closed, usually after cleanup
          break;
        default:
          setIsConnecting(true); // Default to connecting for unknown states
          setIsConnected(false);
          break;
      }
    };
    
    pc.onsignalingstatechange = () => {
      console.log("Signaling state changed:", pc.signalingState);
    };
    
    return pc;
  }, [roomId, socket, setupLocalStream, playerId, cleanUp]); // Added cleanUp dependency

  // Create and send offer
  const createAndSendOffer = useCallback(async (targetPeerId) => {
    if (!pcRef.current || !socket) return;
    
    try {
      console.log(`Creating offer to send to ${targetPeerId}`);
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      console.log("Setting local description (offer)");
      await pcRef.current.setLocalDescription(offer);
      
      remotePeerIdRef.current = targetPeerId;
      
      console.log(`Sending video offer to ${targetPeerId} in room: ${roomId}`);
      socket.emit("video-offer", { 
        roomId, 
        offer,
        from: playerId,
        to: targetPeerId
      });
      
      setOfferSent(true);
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  }, [roomId, socket, playerId]);

  // Handle incoming video offer
  const handleVideoOffer = useCallback(async (data) => {
    if (!socket || !roomId) return;
    
    try {
      console.log(`Video offer received from ${data.from}`);
      remotePeerIdRef.current = data.from;
      
      // Ensure peer connection is set up
      await setupPeerConnection();
      
      if (!pcRef.current) {
        console.warn("PeerConnection not initialized when receiving offer");
        return;
      }
      
      // Only process if we're in a valid state
      if (pcRef.current.signalingState !== 'stable') {
        console.log("Ignoring offer in non-stable state:", pcRef.current.signalingState);
        return;
      }
      
      // Set remote description
      console.log("Setting remote description (offer)");
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      
      // Process any pending ICE candidates
      processPendingCandidates();
      
      // Create and send answer
      console.log("Creating answer");
      const answer = await pcRef.current.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      console.log("Setting local description (answer)");
      await pcRef.current.setLocalDescription(answer);
      
      socket.emit("video-answer", { 
        roomId, 
        answer,
        from: playerId,
        to: data.from
      });
      console.log(`Sending video answer to ${data.from} for room ${roomId}`);
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  }, [roomId, socket, setupPeerConnection, playerId, processPendingCandidates]);

  // Handle incoming video answer
  const handleVideoAnswer = useCallback(async (data) => {
    try {
      console.log(`Video answer received from ${data.from}`);
      remotePeerIdRef.current = data.from;
      
      if (!pcRef.current) {
        console.warn("PeerConnection not initialized when receiving answer");
        return;
      }
      
      // Only apply if we're in the right state
      if (pcRef.current.signalingState !== 'have-local-offer') {
        console.warn("Ignoring answer in state:", pcRef.current.signalingState);
        return;
      }
      
      console.log("Setting remote description (answer)");
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      
      // Process any pending ICE candidates
      processPendingCandidates();
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }, [processPendingCandidates]);

  // Handle incoming ICE candidate
  const handleICECandidate = useCallback(async (data) => {
    try {
      console.log(`ICE candidate received from ${data.from}`);
      remotePeerIdRef.current = data.from;
      
      if (!pcRef.current) {
        console.warn("PeerConnection not initialized when receiving ICE candidate");
        return;
      }
      
      const candidate = new RTCIceCandidate(data.candidate);
      
      // If we have a remote description, add the candidate directly
      if (pcRef.current.remoteDescription) {
        console.log("Adding ICE candidate");
        await pcRef.current.addIceCandidate(candidate);
      } else {
        // Otherwise queue it for later
        console.log("Queueing ICE candidate for later");
        pendingCandidatesRef.current.push(candidate);
      }
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
    }
  }, []);

  // Initialize call function (extracted for reuse) - MOVED UP
  const initializeCall = useCallback(async (targetPeerId) => { // Accept targetPeerId
    if (!socket || !roomId || !isNearbyPlayer || !targetPeerId) {
      console.log("InitializeCall prerequisites not met.");
      return;
    }
    
    // Prevent multiple initializations for the same proximity event
    if (isInitializedRef.current) {
        console.log("Initialization already in progress or completed.");
        return;
    }
    
    console.log(`Initializing video call for room: ${roomId} with player ID: ${playerId} to target: ${targetPeerId}`);
    isInitializedRef.current = true;
    setIsConnecting(true); // Show connecting indicator
    remotePeerIdRef.current = targetPeerId; // Ensure remote peer ID is set
    
    try {
      await setupPeerConnection(); // Ensure PC is ready
      
      if (pcRef.current) {
          // Delay offer slightly to ensure setup completes
          setTimeout(() => {
              if (isInitializedRef.current && remotePeerIdRef.current === targetPeerId) { // Check if still relevant
                 createAndSendOffer(targetPeerId);
              } else {
                 console.log("Initialization cancelled before sending offer.");
                 setIsConnecting(false);
              }
          }, 500); // Reduced delay
      } else {
          console.error("PeerConnection setup failed during initialization.");
          setIsConnecting(false);
          isInitializedRef.current = false; // Allow retry
      }
    } catch (err) {
      console.error("Error initializing call:", err);
      setIsConnecting(false);
      isInitializedRef.current = false; // Allow retry
    }
  }, [isNearbyPlayer, socket, roomId, playerId, setupPeerConnection, createAndSendOffer]);

  // Handle nearby player notifications from GameScreen/SocketContext - NOW AFTER initializeCall
  const handlePlayerNearby = useCallback((data) => {
    console.log(`Player ${data.playerId} is nearby (VideoChat)`);
    if (!remotePeerIdRef.current) { // Only set if not already connected/connecting to someone
        remotePeerIdRef.current = data.playerId;
        // Trigger initialization if needed and not already initialized
        if (isNearbyPlayer && !isInitializedRef.current) {
            console.log("Triggering initializeCall from handlePlayerNearby");
            initializeCall(data.playerId); // Pass target ID
        }
    } else {
        console.log(`Already handling connection with ${remotePeerIdRef.current}, ignoring nearby event for ${data.playerId}`);
    }
  }, [isNearbyPlayer, initializeCall]); // initializeCall dependency is now valid

  // Periodic connection check - Simplified: Rely more on ICE state changes
  useEffect(() => {
    // Keep this simple or remove if ICE state handling is sufficient
    // If connection fails repeatedly, cleanUp might be needed.
    // The 'failed' state in oniceconnectionstatechange can handle this.
    let checkInterval;
    if (isNearbyPlayer && isConnecting && !isConnected) {
        checkInterval = setInterval(() => {
            if (!isConnected && connectionAttempts < 5) {
                console.log(`Still connecting... Attempt ${connectionAttempts + 1}`);
                setConnectionAttempts(prev => prev + 1);
                // Optionally re-trigger offer if needed, but be cautious
                // if (pcRef.current && pcRef.current.signalingState === 'stable' && remotePeerIdRef.current) {
                //    createAndSendOffer(remotePeerIdRef.current);
                // }
            } else if (connectionAttempts >= 5) {
                console.log("Connection timeout, cleaning up.");
                cleanUp();
            }
        }, 5000); // Check every 5 seconds
    }

    return () => clearInterval(checkInterval);
  }, [isNearbyPlayer, isConnecting, isConnected, connectionAttempts, cleanUp]); // Added isConnecting

  // Effect to handle changes in isNearbyPlayer
  useEffect(() => {
    if (isNearbyPlayer) {
      console.log("Player is nearby, ensuring call initialization.");
      // Find the nearby player ID from context or props if available
      // This part depends on how the nearby player ID is passed or accessed.
      // Assuming handlePlayerNearby sets remotePeerIdRef.current correctly.
      if (remotePeerIdRef.current && !isInitializedRef.current) {
         initializeCall(remotePeerIdRef.current);
      } else if (!remotePeerIdRef.current) {
         console.log("Nearby, but no specific remote peer ID yet. Waiting for 'player-nearby' event.");
         // The 'player-nearby' socket event handler should trigger initializeCall
      }
    } else {
      console.log("Player is no longer nearby, cleaning up.");
      cleanUp();
    }
  }, [isNearbyPlayer, cleanUp, initializeCall]); // Dependencies updated

  // Initialize WebRTC signaling listeners
  useEffect(() => {
    if (!socket || !roomId) return;
    
    // Add event listeners
    socket.on("video-offer", handleVideoOffer);
    socket.on("video-answer", handleVideoAnswer);
    socket.on("ice-candidate", handleICECandidate);
    // Listen for nearby event directly here as well, might simplify logic
    socket.on("player-nearby", handlePlayerNearby); 
    
    // Cleanup function
    return () => {
      socket.off("video-offer", handleVideoOffer);
      socket.off("video-answer", handleVideoAnswer);
      socket.off("ice-candidate", handleICECandidate);
      socket.off("player-nearby", handlePlayerNearby);
    };
  }, [socket, roomId, handleVideoOffer, handleVideoAnswer, handleICECandidate, handlePlayerNearby]); // handlePlayerNearby added
  
  // Removed Auto-start effect, handled by isNearbyPlayer effect now

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoOn;
      });
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioOn;
      });
      setIsAudioOn(!isAudioOn);
    }
  };
  
  // Debug info display - Updated to reflect remote stream more accurately
  const getDebugInfo = () => {
    return {
      isNearbyPlayer,
      isInitialized: isInitializedRef.current,
      isConnected,
      isConnecting,
      remotePeerId: remotePeerIdRef.current,
      connectionAttempts,
      signalingState: pcRef.current?.signalingState || 'none',
      iceConnectionState: pcRef.current?.iceConnectionState || 'none',
      hasLocalStream: !!localStream,
      // Check srcObject directly for remote stream presence
      hasRemoteStream: !!remoteVideoRef.current?.srcObject, 
      remoteVideoPaused: remoteVideoRef.current?.paused,
      remoteVideoReadyState: remoteVideoRef.current?.readyState
    };
  };

  if (!isNearbyPlayer) {
    return (
      <div className="video-placeholder">
        <span>Move near another player to start video chat</span>
      </div>
    );
  }

  return (
    <div className="videochat-container">
      <div className="video-grid">
        <div className="video-wrapper">
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            className="video-element" 
          />
          <div className="video-label">You</div>
          <div className="video-controls">
            <button 
              onClick={toggleVideo} 
              className={`control-button ${!isVideoOn ? 'disabled' : ''}`}
              title={isVideoOn ? 'Turn off video' : 'Turn on video'}
            >
              <span className="button-icon">
                {isVideoOn ? '🎥' : '❌'}
              </span>
            </button>
            <button 
              onClick={toggleAudio} 
              className={`control-button ${!isAudioOn ? 'disabled' : ''}`}
              title={isAudioOn ? 'Mute' : 'Unmute'}
            >
              <span className="button-icon">
                {isAudioOn ? '🎤' : '🔇'}
              </span>
            </button>
          </div>
        </div>
        
        <div className="video-wrapper">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="video-element"
            style={{ opacity: isConnected ? 1 : 0, visibility: isConnected ? 'visible' : 'hidden' }} // Control visibility based on isConnected
          />
          <div className="video-label">Remote Player</div>
          {/* Show connecting indicator only when connecting and not yet connected */}
          {isConnecting && !isConnected && (
             <div className="connecting-indicator">
               Connecting...
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

export default VideoChat;