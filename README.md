# Suno Discord Bot

A Discord bot that allows you to manually post your Suno songs to Discord with a simple web interface.

## Quick Deploy to Render

1. Upload these files to Render or connect via GitHub
2. Set environment variables:
   - `DISCORD_TOKEN` = your Discord bot token
   - `DISCORD_CHANNEL_ID` = 1375178931312787457
   - `SUNO_PROFILE_ID` = 3kloudz

3. Build Command: `npm install`
4. Start Command: `node manual_trigger.js`

## How to Use

1. Visit your deployed web app URL
2. Fill in song title and Suno URL
3. Click "Post to Discord"
4. Your song appears in Discord automatically!

## Files Needed for Render

- manual_trigger.js (main bot file)
- config/config.js
- services/discordService.js
- services/sunoService.js (optional)
- utils/logger.js
- utils/storage.js
- data/posted_songs.json