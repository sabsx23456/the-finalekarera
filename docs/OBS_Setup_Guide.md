# OBS Live Streaming Setup Guide

This guide explains how to stream a live video feed from OBS (Open Broadcaster Software) to your Sabong App.

## Prerequisites

1.  **OBS Studio**: Download and install from [obsproject.com](https://obsproject.com/).
2.  **Streaming Service**: You need a service to host your stream and provide a playback URL.
    *   **Option A (Free/Easy):** YouTube Live (Unlisted)
    *   **Option B (Low Latency):** Twitch
    *   **Option C (Self-Hosted/Private):** [See Self-Hosted Guide](./Self_Hosted_Stream_Guide.md) - Best for total control or restricted content.

## Step 1: Set Up Your Scene in OBS

1.  Open OBS Studio.
2.  In the **Sources** box (bottom), click `+` to add sources:
    *   **Video Capture Device**: For your camera (cockpit view).
    *   **Image**: For overlays (logos, fight stats).
    *   **Text (GDI+)**: For dynamic text like "MERON vs WALA".
3.  Arrange your layout in the preview window.

## Step 2: Configure Stream Settings

1.  Go to **Settings** -> **Stream**.
2.  **Service**: Choose your provider (e.g., YouTube - RTMPS).
3.  **Server**: Leave as Auto/Default.
4.  **Stream Key**: Paste the key provided by your streaming service (found in YouTube Studio or Twitch Dashboard).

## Step 3: Start Streaming

1.  Click **Start Streaming** in the Controls dock.
2.  Verify the stream is live on your service's dashboard.

## Step 4: Get Playback URL

**For YouTube:**
1.  Right-click your video on YouTube.
2.  Select "Copy video URL".
3.  *Note: YouTube embeds might show "Video unavailable" if not configured correctly. Ensure "Allow embedding" is checked in video settings.*

**For HLS/RTMP (Professional):**
1.  Your provider will give you an `.m3u8` URL (e.g., `https://stream.example.com/playlist.m3u8`).

## Step 5: Update Stream in App

You **do not** need to edit any code.

1.  Log in to your **Admin Dashboard**.
2.  Scroll down to the **Live Stream Configuration** section.
3.  Paste your stream URL (e.g., YouTube link `https://youtube.com/watch?v=...` or HLS `.m3u8` link).
4.  The video player on the User Dashboard will update automatically for all users.
