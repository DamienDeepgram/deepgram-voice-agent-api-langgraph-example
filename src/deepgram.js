const WebSocket = require("ws");
const { EventEmitter } = require("events");

class DeepgramVoiceAgent extends EventEmitter {
  constructor(apiKey, config) {
    super();
    this.apiKey = apiKey;
    this.config = config;
    this.ws = null;
  }

  connectAgent() {
    if (this.ws) {
      this.ws.close(); // Close existing connection if any
    }

    const wsUrl = "wss://agent.deepgram.com/agent";
    this.ws = new WebSocket(wsUrl, { headers: { Authorization: `token ${this.apiKey}` } });

    this.ws.on("open", () => {
      console.log("Connected to Deepgram Agent");
      this.ws.send(JSON.stringify(this.config));
    });

    this.ws.on("message", (data, isBinary) => {
      if (isBinary) {
        this.emit("audioResponse", data); // Emit binary data for playback
      } else {
        const message = JSON.parse(data.toString());
    
        if (message.type === "FunctionCallRequest") {
          console.log("Emitting FunctionCallRequest:", message);
          this.emit("functionCallRequest", message); // Emit event for FunctionCallRequest
        } else if (message.type === "UserStartedSpeaking") {
          console.log("User started speaking. Stopping audio playback.");
          this.emit("stopAudio"); // Emit an event to stop audio playback
        } else {
          this.emit("textResponse", message); // Emit text response
        }
      }
    });
    

    this.ws.on("error", (error) => {
      this.emit("error", `WebSocket Error: ${error.message}`);
    });

    this.ws.on("close", () => {
      console.log("WebSocket connection closed.");
    });
  }

  handleAudioInput(audioData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  async invoke(state) {
    const messages = state.messages || [];
    if (messages.length === 0) {
      throw new Error("No messages provided in state.");
    }
  
    const lastMessage = messages[messages.length - 1];
  
    // Handle transformed and untransformed message structures
    const content = lastMessage.content || lastMessage.kwargs?.content;
    const additional_kwargs = lastMessage.additional_kwargs || lastMessage.kwargs?.additional_kwargs;
  
    if (!content) {
      throw new Error("Message content is missing.");
    }
  
    // Process content
    this.emit("textResponse", content);
  
    return {
      messages: [
        ...messages,
        {
          type: "ai",
          content: content,
          additional_kwargs: {},
        },
      ],
    };
  }
}

module.exports = DeepgramVoiceAgent;
