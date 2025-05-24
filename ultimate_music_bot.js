const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');
const axios = require('axios');

// Configuration
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID || '1375419981658849342',
        musicVideoChannelId: '1375476962356887614',
        lyricVideoChannelId: '1375476842261385289'
    },
    youtube: {
        apiKey: process.env.YOUTUBE_API_KEY
    }
};

// Simple logger
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};

class UltimateMusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds, 
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates
            ]
        });
        
        this.app = express();
        this.isReady = false;
        this.songHistory = [];
        this.currentPlaylists = {
            music: { songs: [], currentIndex: 0, connection: null, player: null },
            lyric: { songs: [], currentIndex: 0, connection: null, player: null }
        };
    }

    async start() {
        try {
            await this.client.login(config.discord.token);
            logger.info('🎵 Ultimate Music Bot logged in successfully');
            
            this.setupEventHandlers();
            this.setupWebServer();
            
            this.isReady = true;
            logger.info('🚀 Ultimate Music Bot ready!');
        } catch (error) {
            logger.error('Failed to start bot', error);
        }
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            logger.info(`🎵 Bot logged in as ${this.client.user.tag}`);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error', error);
        });
    }

    setupWebServer() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Main dashboard
        this.app.get('/', (req, res) => {
            try {
                res.send(this.renderDashboard());
            } catch (error) {
                logger.error('Dashboard render error', error);
                res.send('<h1>🎵 Ultimate Music Bot</h1><p>Loading amazing features...</p>');
            }
        });

        // Post song endpoint (existing functionality)
        this.app.post('/post-song', async (req, res) => {
            try {
                const { url, title, description, useAI } = req.body;
                
                if (!url || !title) {
                    return res.status(400).json({ error: 'URL and title are required' });
                }

                let finalDescription = description || '';
                
                if (useAI && process.env.OPENAI_API_KEY) {
                    try {
                        finalDescription = await this.generateAIFeatures({ title, url });
                    } catch (error) {
                        logger.warn('AI enhancement failed, using manual description');
                    }
                }

                await this.postToDiscord(title, url, finalDescription);
                
                const song = {
                    id: this.generateSongId(url),
                    title,
                    url,
                    description: finalDescription,
                    timestamp: new Date().toISOString()
                };
                
                this.songHistory.unshift(song);
                this.songHistory = this.songHistory.slice(0, 50);

                res.json({ success: true, message: 'Song posted successfully!' });
            } catch (error) {
                logger.error('Error posting song', error);
                res.status(500).json({ error: 'Failed to post song' });
            }
        });

        // Extract song data
        this.app.post('/extract-song', async (req, res) => {
            try {
                const { url } = req.body;
                const songData = await this.extractSongData(url);
                res.json(songData);
            } catch (error) {
                logger.error('Error extracting song data', error);
                res.status(500).json({ error: 'Failed to extract song data' });
            }
        });

        // NEW: Load YouTube playlist
        this.app.post('/load-playlist', async (req, res) => {
            try {
                const { playlistUrl, channelType } = req.body;
                
                if (!playlistUrl || !channelType) {
                    return res.status(400).json({ error: 'Playlist URL and channel type are required' });
                }

                const songs = await this.getPlaylistSongs(playlistUrl);
                this.currentPlaylists[channelType].songs = songs;
                this.currentPlaylists[channelType].currentIndex = 0;

                res.json({ 
                    success: true, 
                    message: `Loaded ${songs.length} songs for ${channelType} videos`,
                    songs: songs.slice(0, 10) // Return first 10 for preview
                });
            } catch (error) {
                logger.error('Error loading playlist', error);
                res.status(500).json({ error: 'Failed to load playlist' });
            }
        });

        // NEW: Voice channel controls
        this.app.post('/voice-control', async (req, res) => {
            try {
                const { action, channelType } = req.body;
                
                switch (action) {
                    case 'play':
                        await this.playCurrentSong(channelType);
                        break;
                    case 'pause':
                        this.pausePlayback(channelType);
                        break;
                    case 'skip':
                        await this.skipSong(channelType);
                        break;
                    case 'stop':
                        this.stopPlayback(channelType);
                        break;
                    case 'join':
                        await this.joinVoiceChannel(channelType);
                        break;
                    case 'leave':
                        this.leaveVoiceChannel(channelType);
                        break;
                }

                res.json({ success: true, message: `${action} executed for ${channelType} channel` });
            } catch (error) {
                logger.error('Error with voice control', error);
                res.status(500).json({ error: 'Failed to execute voice control' });
            }
        });

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🌟 Web server running on port ${PORT}`);
        }).on('error', (err) => {
            logger.error('Server failed to start', err);
        });
    }

    async getPlaylistSongs(playlistUrl) {
        // Extract playlist ID from URL
        const playlistId = this.extractPlaylistId(playlistUrl);
        
        if (!config.youtube.apiKey) {
            throw new Error('YouTube API key is required');
        }

        try {
            const response = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
                params: {
                    part: 'snippet',
                    playlistId: playlistId,
                    maxResults: 50,
                    key: config.youtube.apiKey
                }
            });

            return response.data.items.map(item => ({
                id: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
                thumbnail: item.snippet.thumbnails.default.url
            }));
        } catch (error) {
            logger.error('Failed to fetch playlist', error);
            throw error;
        }
    }

    extractPlaylistId(url) {
        const match = url.match(/[?&]list=([^&]+)/);
        return match ? match[1] : null;
    }

    async joinVoiceChannel(channelType) {
        const channelId = channelType === 'music' ? 
            config.discord.musicVideoChannelId : 
            config.discord.lyricVideoChannelId;

        const channel = await this.client.channels.fetch(channelId);
        if (!channel) {
            throw new Error('Voice channel not found');
        }

        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        connection.subscribe(player);

        this.currentPlaylists[channelType].connection = connection;
        this.currentPlaylists[channelType].player = player;

        logger.info(`🎵 Joined ${channelType} voice channel`);
    }

    async playCurrentSong(channelType) {
        const playlist = this.currentPlaylists[channelType];
        
        if (!playlist.connection || !playlist.player) {
            await this.joinVoiceChannel(channelType);
        }

        if (playlist.songs.length === 0) {
            throw new Error('No songs in playlist');
        }

        const currentSong = playlist.songs[playlist.currentIndex];
        
        try {
            const stream = ytdl(currentSong.url, { 
                filter: 'audioonly',
                quality: 'highestaudio'
            });
            
            const resource = createAudioResource(stream);
            playlist.player.play(resource);
            
            logger.info(`🎵 Playing: ${currentSong.title} in ${channelType} channel`);
        } catch (error) {
            logger.error('Failed to play song', error);
            throw error;
        }
    }

    pausePlayback(channelType) {
        const player = this.currentPlaylists[channelType].player;
        if (player) {
            player.pause();
            logger.info(`⏸️ Paused ${channelType} playback`);
        }
    }

    async skipSong(channelType) {
        const playlist = this.currentPlaylists[channelType];
        playlist.currentIndex = (playlist.currentIndex + 1) % playlist.songs.length;
        await this.playCurrentSong(channelType);
    }

    stopPlayback(channelType) {
        const player = this.currentPlaylists[channelType].player;
        if (player) {
            player.stop();
            logger.info(`⏹️ Stopped ${channelType} playback`);
        }
    }

    leaveVoiceChannel(channelType) {
        const connection = this.currentPlaylists[channelType].connection;
        if (connection) {
            connection.destroy();
            this.currentPlaylists[channelType].connection = null;
            this.currentPlaylists[channelType].player = null;
            logger.info(`👋 Left ${channelType} voice channel`);
        }
    }

    // Existing methods (extractSongData, generateAIFeatures, postToDiscord, etc.)
    async extractSongData(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = response.data;
            let title = 'Unknown Song';

            const titlePatterns = [
                /<title[^>]*>([^<]+)/i,
                /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
                /<meta[^>]+name="title"[^>]+content="([^"]+)"/i,
                /"title"\s*:\s*"([^"]+)"/i
            ];

            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1] && match[1].trim() !== 'Suno') {
                    title = match[1].trim().replace(/\s*\|\s*Suno\s*$/, '');
                    break;
                }
            }

            return { title, url };
        } catch (error) {
            logger.error('Error extracting song data', error);
            return { title: 'Unknown Song', url };
        }
    }

    async generateAIFeatures(songData) {
        if (!process.env.OPENAI_API_KEY) {
            return 'Enhanced with AI features';
        }

        try {
            const { default: OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                    role: "user",
                    content: `Create a brief, engaging description for this Suno song: "${songData.title}". Make it 1-2 sentences, focusing on the musical style and mood. Be creative but concise.`
                }],
                max_tokens: 100
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            logger.error('AI generation failed', error);
            return 'Enhanced with AI features';
        }
    }

    async postToDiscord(title, url, description = '') {
        try {
            const channel = await this.client.channels.fetch(config.discord.channelId);
            
            if (!channel) {
                throw new Error('Discord channel not found');
            }

            let message = `🎵 **New Suno song:** ${title}\n${url}`;
            
            if (description) {
                message += `\n\n💭 ${description}`;
            }

            await channel.send(message);
            logger.info(`Posted song to Discord: ${title}`);
        } catch (error) {
            logger.error('Failed to post to Discord', error);
            throw error;
        }
    }

    generateSongId(url) {
        return url.split('/').pop() || Math.random().toString(36).substr(2, 9);
    }

    renderDashboard() {
        const musicPlaylist = this.currentPlaylists.music;
        const lyricPlaylist = this.currentPlaylists.lyric;
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Ultimate Music Bot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            color: white;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(34, 197, 94, 0.9);
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            color: white;
        }
        
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .card {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        
        .full-width {
            grid-column: 1 / -1;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #374151;
        }
        
        input, textarea, select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .button-group {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        
        button {
            flex: 1;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
            min-width: 120px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-music {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
        }
        
        .btn-lyric {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }
        
        .btn-control {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .playlist-info {
            background: #f9fafb;
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
        }
        
        .current-song {
            font-weight: 600;
            color: #111827;
            margin-bottom: 8px;
        }
        
        .song-count {
            color: #6b7280;
            font-size: 14px;
        }
        
        .controls {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 16px;
        }
        
        .controls button {
            min-width: auto;
            padding: 8px 16px;
            font-size: 14px;
        }
        
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #6b7280;
        }
        
        .message {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        
        .message.success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #a7f3d0;
        }
        
        .message.error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .container {
                padding: 15px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎵 Ultimate Music Bot</h1>
            <div class="status">
                <span>●</span>
                ${this.isReady ? 'Ready' : 'Connecting...'}
            </div>
        </div>
        
        <div class="message" id="message"></div>
        
        <!-- Suno Song Posting -->
        <div class="card full-width">
            <h2 style="margin-bottom: 20px; color: #374151;">🎵 Post Suno Song</h2>
            
            <form id="songForm">
                <div class="form-group">
                    <label for="url">Suno Song URL *</label>
                    <input type="url" id="url" name="url" placeholder="https://suno.com/song/..." required>
                </div>
                
                <div class="form-group">
                    <label for="title">Song Title *</label>
                    <input type="text" id="title" name="title" placeholder="Enter song title or auto-extract" required>
                </div>
                
                <div class="form-group">
                    <label for="description">Description (Optional)</label>
                    <textarea id="description" name="description" rows="3" placeholder="Add a custom description or let AI generate one"></textarea>
                </div>
                
                <div class="button-group">
                    <button type="button" class="btn-primary" onclick="extractSong()">🎯 Auto-Extract</button>
                    <button type="submit" class="btn-primary">🚀 Post Song</button>
                    <button type="submit" class="btn-primary" onclick="submitWithAI(event)">✨ Post with AI</button>
                </div>
            </form>
        </div>
        
        <!-- YouTube Playlists -->
        <div class="grid">
            <!-- Music Videos -->
            <div class="card">
                <h3 style="color: #374151; margin-bottom: 16px;">🎬 Music Videos</h3>
                
                <div class="form-group">
                    <label for="musicPlaylist">YouTube Playlist URL</label>
                    <input type="url" id="musicPlaylist" placeholder="https://youtube.com/playlist?list=...">
                </div>
                
                <button class="btn-music" onclick="loadPlaylist('music')">📥 Load Playlist</button>
                
                <div class="playlist-info">
                    <div class="current-song">Songs: ${musicPlaylist.songs.length}</div>
                    <div class="song-count">Current: ${musicPlaylist.currentIndex + 1}/${musicPlaylist.songs.length}</div>
                    
                    <div class="controls">
                        <button class="btn-control" onclick="voiceControl('join', 'music')">🎵 Join</button>
                        <button class="btn-control" onclick="voiceControl('play', 'music')">▶️ Play</button>
                        <button class="btn-control" onclick="voiceControl('pause', 'music')">⏸️ Pause</button>
                        <button class="btn-control" onclick="voiceControl('skip', 'music')">⏭️ Skip</button>
                        <button class="btn-control" onclick="voiceControl('stop', 'music')">⏹️ Stop</button>
                        <button class="btn-control" onclick="voiceControl('leave', 'music')">👋 Leave</button>
                    </div>
                </div>
            </div>
            
            <!-- Lyric Videos -->
            <div class="card">
                <h3 style="color: #374151; margin-bottom: 16px;">🎤 Lyric Videos</h3>
                
                <div class="form-group">
                    <label for="lyricPlaylist">YouTube Playlist URL</label>
                    <input type="url" id="lyricPlaylist" placeholder="https://youtube.com/playlist?list=...">
                </div>
                
                <button class="btn-lyric" onclick="loadPlaylist('lyric')">📥 Load Playlist</button>
                
                <div class="playlist-info">
                    <div class="current-song">Songs: ${lyricPlaylist.songs.length}</div>
                    <div class="song-count">Current: ${lyricPlaylist.currentIndex + 1}/${lyricPlaylist.songs.length}</div>
                    
                    <div class="controls">
                        <button class="btn-control" onclick="voiceControl('join', 'lyric')">🎵 Join</button>
                        <button class="btn-control" onclick="voiceControl('play', 'lyric')">▶️ Play</button>
                        <button class="btn-control" onclick="voiceControl('pause', 'lyric')">⏸️ Pause</button>
                        <button class="btn-control" onclick="voiceControl('skip', 'lyric')">⏭️ Skip</button>
                        <button class="btn-control" onclick="voiceControl('stop', 'lyric')">⏹️ Stop</button>
                        <button class="btn-control" onclick="voiceControl('leave', 'lyric')">👋 Leave</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="loading" id="loading">
            <div>⏳ Processing your request...</div>
        </div>
    </div>
    
    <script>
        function showMessage(text, type) {
            const message = document.getElementById('message');
            message.textContent = text;
            message.className = 'message ' + type;
            message.style.display = 'block';
            setTimeout(() => {
                message.style.display = 'none';
            }, 5000);
        }
        
        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }
        
        // Existing Suno functions
        async function extractSong() {
            const url = document.getElementById('url').value;
            if (!url) {
                showMessage('Please enter a Suno URL first', 'error');
                return;
            }
            
            showLoading(true);
            try {
                const response = await fetch('/extract-song', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                if (data.title) {
                    document.getElementById('title').value = data.title;
                    showMessage('Song title extracted successfully!', 'success');
                } else {
                    showMessage('Could not extract title automatically', 'error');
                }
            } catch (error) {
                showMessage('Failed to extract song data', 'error');
            }
            showLoading(false);
        }
        
        function submitWithAI(event) {
            event.preventDefault();
            document.getElementById('songForm').dispatchEvent(new Event('submit'));
            document.querySelector('input[name="useAI"]')?.remove();
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'useAI';
            input.value = 'true';
            document.getElementById('songForm').appendChild(input);
        }
        
        document.getElementById('songForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            if (!data.url || !data.title) {
                showMessage('URL and title are required', 'error');
                return;
            }
            
            showLoading(true);
            try {
                const response = await fetch('/post-song', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                if (result.success) {
                    showMessage(result.message, 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showMessage(result.error || 'Failed to post song', 'error');
                }
            } catch (error) {
                showMessage('Network error occurred', 'error');
            }
            showLoading(false);
        });
        
        // NEW: YouTube playlist functions
        async function loadPlaylist(channelType) {
            const inputId = channelType === 'music' ? 'musicPlaylist' : 'lyricPlaylist';
            const playlistUrl = document.getElementById(inputId).value;
            
            if (!playlistUrl) {
                showMessage('Please enter a YouTube playlist URL', 'error');
                return;
            }
            
            showLoading(true);
            try {
                const response = await fetch('/load-playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playlistUrl, channelType })
                });
                
                const result = await response.json();
                if (result.success) {
                    showMessage(result.message, 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showMessage(result.error || 'Failed to load playlist', 'error');
                }
            } catch (error) {
                showMessage('Network error occurred', 'error');
            }
            showLoading(false);
        }
        
        async function voiceControl(action, channelType) {
            showLoading(true);
            try {
                const response = await fetch('/voice-control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, channelType })
                });
                
                const result = await response.json();
                if (result.success) {
                    showMessage(result.message, 'success');
                } else {
                    showMessage(result.error || 'Failed to execute control', 'error');
                }
            } catch (error) {
                showMessage('Network error occurred', 'error');
            }
            showLoading(false);
        }
    </script>
</body>
</html>
        `;
    }
}

// Start the bot
const bot = new UltimateMusicBot();
bot.start().catch(error => {
    logger.error('Failed to start bot', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down bot...');
    process.exit(0);
});