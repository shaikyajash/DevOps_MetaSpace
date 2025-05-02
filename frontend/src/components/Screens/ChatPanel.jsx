import React, { useEffect } from "react";

const ICE_SERVERS = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };


const ChatPanel = ({socket}) => {

    if(!socket) return;


    useEffect(()=>{

        const pc   = initializePeerConnection();
        if(!pc) return;

        




    })





  return (
    <div className="chat-input-area">
      <input
        type="text"
        className="chat-input"
        placeholder="Type a message..."
      />
      <button className="send-button">Send</button>
    </div>
  );
};

export default ChatPanel;
