# deepgram-voice-agent-api-langgraph-example

## Build

```
npm i
```

## Set Env Vars

Rename `.env.sample` to `.env` and set your `DEEPGRAM_API_KEY`

## Running

```
npm run start
```

## Set your mic device in index.js

```
const micInstance = mic({
    rate: INPUT_SAMPLE_RATE,
    channels: '1',
    debug: false,
    device: 'plughw:2,7' // Replace this with your microphone device
});
```

## Function Calling

To call the local function say "Add Item" and the name of the item.