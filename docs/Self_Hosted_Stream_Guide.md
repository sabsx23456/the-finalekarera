# Self-Hosted Live Streaming Guide

If you cannot use public platforms like YouTube or Twitch (due to content restrictions or privacy needs), you can host your own streaming server. This gives you full control and ownership of your stream.

## Architecture

1.  **Source**: OBS Studio (running on your PC).
2.  **Server**: A VPS (Virtual Private Server) running RTMP software.
3.  **Playback**: Your Sabong App (plays the stream from your Server).

## Prerequisites

1.  **A VPS Server**: You need a Linux server (Ubuntu recommended).
    *   Providers: DigitalOcean, Linode, Vultr, or "Offshore" hosting providers if anonymity is required.
    *   Specs: 2 CPU / 4GB RAM is usually enough for a starter stream.
2.  **Domain Name (Optional)**: Makes the URL look nicer (e.g., `live.mysite.com` instead of `123.45.67.89`).

## Step-by-Step Setup (Using Node-Media-Server)

This is the easiest way to set up a server using Node.js.

### 1. Install Node-Media-Server on your VPS

SSH into your VPS and run:

```bash
# Install Node.js if not present
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create project folder
mkdir my-stream-server
cd my-stream-server
npm init -y
npm install node-media-server
```

### 2. Create the Server Script

Create a file `app.js`:

```javascript
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: './media', // Where video segments are stored
  },
  trans: {
    ffmpeg: '/usr/bin/ffmpeg', // Ensure FFMPEG is installed
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

var nms = new NodeMediaServer(config);
nms.run();
```

*(Note: You must install ffmpeg on the server: `sudo apt install ffmpeg`)*

### 3. Start the Server

```bash
node app.js
```

## Configuring OBS

1.  **Service**: Custom...
2.  **Server**: `rtmp://<YOUR_VPS_IP>/live`
3.  **Stream Key**: `stream` (or any name you want)

## Configuring Your App

Once you start streaming in OBS, your playback URL will be:

`http://<YOUR_VPS_IP>:8000/live/stream/index.m3u8`

1.  Copy this URL.
2.  Go to your **Admin Dashboard**.
3.  Paste it into the **Live Stream Configuration**.
4.  Your User Dashboard will now play your private, self-hosted stream.

## Important Considerations

*   **Latency**: HLS has a delay (usually 10-30 seconds). Tune your `hls_time` in the config to lower it.
*   **Bandwidth**: Streaming uses a lot of data. Ensure your VPS provider has generous bandwidth limits.

## Alternative: Hosting From Your Own PC (Home Server)

If you don't want to buy a VPS, you can run the streaming server on your own computer.

### Risks
*   **Privacy**: Your home IP address will be exposed if you don't use a tunnel like ngrok.
*   **Reliability**: If your PC turns off or internet drops, the stream dies.
*   **Speed**: You need good **Upload Speed** (at least 5-10 Mbps).

### Setup Steps (Windows)

1.  **Install Node.js for Windows**: Download from [nodejs.org](https://nodejs.org/).
2.  **Create the Server**:
    *   Create a folder `C:\StreamServer`.
    *   Open Command Prompt inside that folder.
    *   Run `npm init -y` and `npm install node-media-server`.
    *   Create `app.js` with the code above.
    *   **Install FFMPEG**: Download FFMPEG for Windows, extract it, and update the `ffmpeg` path in `app.js` to point to `C:/path/to/ffmpeg.exe`.
3.  **Run Server**: `node app.js` in Command Prompt.
4.  **Expose to Internet (The Hard Part)**:
    *   **Option A (Easiest - Ngrok)**:
        1.  Install [ngrok](https://ngrok.com).
        2.  Run `ngrok http 8000`.
        3.  Ngrok will give you a public URL (e.g., `https://random-name.ngrok.io`).
        4.  Your App URL will be: `https://random-name.ngrok.io/live/stream/index.m3u8`.
    *   **Option B (Port Forwarding)**:
        1.  Log into your router (usually `192.168.1.1`).
        2.  Forward port `8000` (TCP) to your PC's local IP.
        3.  Forward port `1935` (TCP) if you want to stream efficiently, though OBS can stream to `localhost`.
        4.  Your App URL will use your public home IP: `http://<YOUR_HOME_IP>:8000/live/stream/index.m3u8`.

**Pro Tip**: Use Option A (Ngrok) for testing. It's much safer and easier than messing with router settings.
