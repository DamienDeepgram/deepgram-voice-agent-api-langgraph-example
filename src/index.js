const DeepgramVoiceAgent = require('./deepgram');
const { StateGraph, MessagesAnnotation } = require("@langchain/langgraph");
const { HumanMessage } = require("@langchain/core/messages");
const mic = require('mic');
const AudioPlayer = require('./audio-player');
require('dotenv').config();

const INPUT_SAMPLE_RATE = 16000; 
const OUTPUT_SAMPLE_RATE = 48000; // Replace with your server's output sample rate
const audioPlayer = new AudioPlayer(OUTPUT_SAMPLE_RATE);

// Load API Key
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

// Full Configuration Object
const agentConfig = {
  type: "SettingsConfiguration",
  audio: {
    input: {
      encoding: "linear16",
      sample_rate: INPUT_SAMPLE_RATE,
    },
    output: {
      encoding: "linear16",
      sample_rate: OUTPUT_SAMPLE_RATE,
      container: "none",
    },
  },
  agent: {
    listen: {
      model: "nova-2",
    },
    speak: {
      model: "aura-asteria-en",
    },
    think: {
      provider: {
        type: "open_ai"
      },
      model: "gpt-4o",
      instructions: "You are a helpful assistant you can add any items to an order when the user asks to 'add item' followed by the item name.",
      functions: [
        {
          name: "add_item",
          description: "Add an item to an order.",
          parameters: {
            type: "object",
            properties: {
              item: {
                type: "string",
                description: `
                  The name of the item that the user would like to order.
                  The valid values are only those on the menu.
                `,
              },
            },
            required: ["item"],
          },
        },
      ],
    },
  },
};

// Initialize the agent
const agent = new DeepgramVoiceAgent(DEEPGRAM_API_KEY, agentConfig);

// Local function definitions
const localFunctions = {
  add_item: async (input) => {
    const { item } = input;
    console.log(`Adding item to order: ${item}`);
    return `Item "${item}" added to the order.`;
  },
};

// Define routing logic for StateGraph
function shouldContinue({ messages }) {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.type === "FunctionCallRequest") {
    return "localFunctions";
  }
  return "__end__"; // Stop after processing
}

// Define StateGraph Workflow
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("DeepgramVoiceAgent", async (state) => agent.invoke(state))
  .addEdge("__start__", "DeepgramVoiceAgent")
  .addNode("localFunctions", async (state) => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage.type !== "FunctionCallRequest") {
      return state;
    }
    console.log("Routing to localFunctions:");

    const { function_name, input } = lastMessage.additional_kwargs || {};
    if (localFunctions[function_name]) {
      const output = await localFunctions[function_name](input);
      return {
        messages: [
          ...state.messages,
          {
            type: "FunctionCallResponse",
            output,
          },
        ],
      };
    }

    throw new Error(`Function "${function_name}" not implemented.`);
  })
  .addEdge("DeepgramVoiceAgent", "localFunctions")
  .addConditionalEdges("localFunctions", shouldContinue);


// Connect to the Deepgram Voice Agent
agent.connectAgent();

// Handle microphone input
function setupMicrophone() {
  const micInstance = mic({
    rate: INPUT_SAMPLE_RATE,
    channels: '1',
    debug: false,
    device: 'plughw:2,7' // Replace this with your microphone device
  });

  const micInputStream = micInstance.getAudioStream();

  micInputStream.on('data', (data) => {
    agent.handleAudioInput(data); // Send microphone data to the agent
  });

  micInputStream.on('error', (error) => {
    console.error('Microphone error:', error);
  });

  micInstance.start();
  console.log('Microphone started.');
}

// Start the microphone
setupMicrophone();

agent.on("functionCallRequest", async (message) => {
  const { function_name, function_call_id, input } = message;

  // Ensure the function exists
  if (localFunctions[function_name]) {
    try {
      const output = await localFunctions[function_name](input);

      // Return the response back to Deepgram
      agent.ws.send(
        JSON.stringify({
          type: "FunctionCallResponse",
          function_call_id,
          output,
        })
      );
    } catch (err) {
      console.error(`Error executing local function "${function_name}":`, err);
    }
  } else {
    console.error(`Function "${function_name}" not implemented.`);
  }
});


// Handle outputs from the agent
agent.on('textResponse', (response) => {
  console.log('Agent text response:', response);
});

// Handle audioResponse event
agent.on("audioResponse", (audio) => {

  try {
    audioPlayer.play(audio); // Play the audio
  } catch (err) {
      console.error('Error playing audio:', err);
  }
});

// Handle stopAudio event
agent.on("stopAudio", () => {
  console.log("Stopping audio playback.");
  audioPlayer.stop();
});

agent.on('error', (error) => {
  console.error('Agent error:', error);
});

// Compile and run the workflow
(async () => {
  try {
    // Compile the workflow into a runnable object
    const app = workflow.compile();

    // Define the initial state for the workflow
    const initialState = {
      messages: [
        {
          type: "human", // Explicitly set the type
          content: "Hello",
          additional_kwargs: {
            metadata: {
              audioStream: true,
            },
          },
        },
      ],
    };

    const finalState = await app.invoke(initialState);

    console.log('Workflow execution completed:', finalState);
  } catch (error) {
    console.error('Error executing workflow:', error);
  }
})();
