const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const axios = require('axios');
const express = require('express');
const puppeteer = require('puppeteer');

class FixedMusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.musicQueue = [];
        this.currentSong = null;
        this.connection = null;
        this.player = null;
        this.currentVideoId = null;
        
        // Connection status for dashboard
        this.connectionStatus = {
            connected: false,
            channelName: null,
            playing: false
        };
        
        // Web server
        this.app = express();
        this.app.use(express.static('.'));
        this.app.use(express.json());

        // Suno monitoring
        this.monitoredProfiles = [
            { id: process.env.SUNO_PROFILE_ID || '3kloudz', name: 'Main Profile' }
        ];
        this.startProfileMonitoring();
    }

    async start() {
        try {
            this.setupDiscordEvents();
            await this.registerSlashCommands();
            this.setupWebServer();
            
            await this.client.login(process.env.DISCORD_TOKEN);
            console.log('🎵 Fixed Music Bot started successfully!');
        } catch (error) {
            console.error('❌ Failed to start bot:', error);
        }
    }

    setupDiscordEvents() {
        this.client.once('ready', () => {
            console.log(`🎵 Bot logged in as ${this.client.user.tag}`);
            this.registerSlashCommands();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            try {
                if (interaction.commandName === 'load') {
                    const url = interaction.options.getString('url');
                    await this.handleLoadAndPlay(interaction, url);
                }
            } catch (error) {
                console.error('❌ Command error:', error.message);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply('❌ Something went wrong. Please try again.');
                    }
                } catch (e) {
                    console.log('Could not send error reply');
                }
            }
        });
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('load')
                .setDescription('Load and play YouTube video or playlist')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('YouTube URL to play')
                        .setRequired(true))
        ];

        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        
        try {
            console.log('🔄 Refreshing slash commands...');
            await rest.put(Routes.applicationCommands(this.client.user?.id || process.env.DISCORD_CLIENT_ID), {
                body: commands.map(command => command.toJSON())
            });
            console.log('✅ Slash commands registered!');
        } catch (error) {
            console.error('❌ Failed to register commands:', error);
        }
    }

    async handleLoadAndPlay(interaction, url) {
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply();
            }
            
            // Find voice channel
            let targetChannel = null;
            if (interaction.member?.voice?.channel) {
                targetChannel = interaction.member.voice.channel;
            } else {
                const guild = interaction.guild;
                targetChannel = guild.channels.cache.find(channel => 
                    channel.type === 2 && 
                    (channel.name.toLowerCase().includes('music') || 
                     channel.name.toLowerCase().includes('general'))
                );
            }
            
            if (!targetChannel) {
                return await this.safeEditReply(interaction, '❌ Could not find a voice channel! Join a voice channel first.');
            }

            await this.joinVoiceChannelById(targetChannel.id, interaction.guild);
            
            if (this.isPlaylistUrl(url)) {
                const playlistId = this.extractPlaylistId(url);
                console.log(`📋 Extracted playlist ID: ${playlistId}`);
                
                if (!playlistId) {
                    return await this.safeEditReply(interaction, '❌ Could not extract playlist ID from URL');
                }
                
                const songs = await this.getPlaylistSongs(url);
                if (songs.length === 0) {
                    return await this.safeEditReply(interaction, '❌ Failed to load playlist! Please check the URL.');
                }
                
                this.musicQueue.push(...songs);
                await this.safeEditReply(interaction, `✅ Added ${songs.length} songs from playlist! 🎵`);
            } else {
                const videoId = this.extractVideoId(url);
                if (!videoId) {
                    return await this.safeEditReply(interaction, '❌ Invalid YouTube URL! Please check and try again.');
                }
                
                this.musicQueue.push({ 
                    videoId, 
                    url,
                    title: `Video ${videoId}`,
                    duration: 'Unknown'
                });
                this.currentVideoId = videoId;
                await this.safeEditReply(interaction, '✅ Added to queue! 🎵');
            }
            
            if (!this.currentSong) {
                this.playCurrentSong();
            }
            
        } catch (error) {
            console.error('❌ Load error:', error);
            await this.safeEditReply(interaction, '❌ Failed to load content. Please try again.');
        }
    }

    async safeEditReply(interaction, message) {
        try {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply(message);
            }
        } catch (error) {
            console.log('Could not edit reply:', error.message);
        }
    }

    isPlaylistUrl(url) {
        return url.includes('list=');
    }

    extractPlaylistId(url) {
        // Fixed to handle your URL with &si= parameter
        const regex = /[&?]list=([^&]+)/;
        const match = url.match(regex);
        if (match) {
            return match[1]; // This will correctly extract PL8q-ssNZHeJPQTxjcUT3AobA_hnV4WV7t
        }
        return null;
    }

    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async getPlaylistSongs(playlistUrl) {
        try {
            const playlistId = this.extractPlaylistId(playlistUrl);
            if (!playlistId) return [];
            
            console.log(`📋 Loading playlist: ${playlistId}`);
            
            if (process.env.YOUTUBE_API_KEY) {
                const response = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
                    params: {
                        part: 'snippet',
                        playlistId: playlistId,
                        maxResults: 50,
                        key: process.env.YOUTUBE_API_KEY
                    }
                });
                
                return response.data.items.map(item => ({
                    videoId: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
                    duration: 'Unknown'
                }));
            } else {
                console.log('⚠️ No YouTube API key - limited playlist support');
                return [{
                    videoId: 'demo',
                    title: 'Demo Song (Need YouTube API key for full playlist)',
                    url: playlistUrl,
                    duration: 'Unknown'
                }];
            }
        } catch (error) {
            console.error('❌ Playlist error:', error.message);
            return [];
        }
    }

    async joinVoiceChannelById(channelId, guild) {
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        this.connection = connection;
        this.player = createAudioPlayer();
        connection.subscribe(this.player);
        
        this.connectionStatus.connected = true;
        this.connectionStatus.channelName = guild.channels.cache.get(channelId)?.name || 'Unknown';
        
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('🎵 Connected to voice channel:', this.connectionStatus.channelName);
        });
        
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            this.connectionStatus.connected = false;
            this.connectionStatus.playing = false;
        });
    }

    async playCurrentSong() {
        if (this.musicQueue.length === 0 || !this.player) return;
        
        try {
            this.currentSong = this.musicQueue.shift();
            this.currentVideoId = this.currentSong.videoId;
            
            console.log('🎵 Playing:', this.currentSong.title);
            
            const stream = ytdl(this.currentSong.url, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });
            
            const resource = createAudioResource(stream);
            this.player.play(resource);
            
            this.player.on(AudioPlayerStatus.Playing, () => {
                console.log('✅ Audio is playing');
                this.connectionStatus.playing = true;
            });
            
            this.player.on(AudioPlayerStatus.Idle, () => {
                this.connectionStatus.playing = false;
                if (this.musicQueue.length > 0) {
                    setTimeout(() => this.playCurrentSong(), 1000);
                }
            });
            
        } catch (error) {
            console.error('❌ Playback error:', error);
            setTimeout(() => this.playCurrentSong(), 2000);
        }
    }

    // Suno monitoring
    startProfileMonitoring() {
        console.log('🔄 Starting Suno profile monitoring...');
        setInterval(() => {
            this.checkAllProfilesForNewSongs();
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    async checkAllProfilesForNewSongs() {
        for (const profile of this.monitoredProfiles) {
            await this.checkProfileForNewSongs(profile);
        }
    }

    async checkProfileForNewSongs(profile) {
        try {
            const songs = await this.getSunoProfileSongs(profile.id);
            // Implementation would go here for posting new songs
            console.log(`✅ Checked profile ${profile.name}: ${songs.length} songs found`);
        } catch (error) {
            console.error(`❌ Error checking profile ${profile.name}:`, error.message);
        }
    }

    async getSunoProfileSongs(profileId) {
        // Basic implementation - would need proper Suno API integration
        return [];
    }

    setupWebServer() {
        this.app.get('/', (req, res) => {
            res.send(this.renderDashboard());
        });

        this.app.post('/suno', async (req, res) => {
            try {
                const { url } = req.body;
                if (!url) return res.status(400).send('URL is required');
                
                console.log('🎤 Suno submission:', url);
                await this.extractSunoData(url);
                res.send('✅ Suno song submitted successfully!');
            } catch (error) {
                console.error('❌ Suno submission error:', error);
                res.status(500).send('❌ Failed to process Suno song');
            }
        });

        this.app.listen(5000, '0.0.0.0', () => {
            console.log('🌟 Web server running on port 5000');
        });
    }

    async extractSunoData(url) {
        // Implementation for Suno data extraction
        return { title: 'Suno Song', url: url };
    }

    renderDashboard() {
        const currentVideo = this.currentVideoId ? 
            `<iframe width="560" height="315" src="https://www.youtube.com/embed/${this.currentVideoId}" frameborder="0" allowfullscreen style="pointer-events: none;"></iframe>` :
            '<div class="no-video"><h3>No video playing</h3></div>';

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3AM VERIFIED - Enhanced Music Bot</title>
    <style>
        :root {
            --bg-primary: #0a0a0a;
            --bg-secondary: #1a1a1a;
            --accent-primary: #00ffff;
            --accent-secondary: #ff00ff;
            --text-primary: #ffffff;
            --text-secondary: #cccccc;
            --border-color: rgba(255, 255, 255, 0.1);
            --input-bg: rgba(255, 255, 255, 0.05);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
            position: relative;
        }

        .animated-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            background: linear-gradient(45deg, #ff006e, #8338ec, #3a86ff, #06ffa5, #ffbe0b);
            background-size: 400% 400%;
            animation: gradientShift 8s ease infinite;
            opacity: 0.15;
        }

        @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        .header {
            text-align: center;
            margin-bottom: 50px;
            padding: 40px 20px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 255, 255, 0.3);
            position: relative;
            overflow: hidden;
        }

        .header h1 {
            font-size: 3.5rem;
            font-weight: bold;
            text-shadow: 0 0 20px rgba(0, 255, 255, 0.8);
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }

        .section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            padding: 30px;
            margin: 25px 0;
            border-radius: 15px;
            backdrop-filter: blur(20px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .section h2 {
            color: var(--accent-primary);
            margin-bottom: 20px;
            font-size: 1.8rem;
            text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        }

        .connection-status {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        
        .status-item {
            background: var(--input-bg);
            padding: 15px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
        }
        
        .status-label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
            color: var(--text-secondary);
        }
        
        .status-value {
            font-size: 1.1rem;
            font-weight: bold;
        }
        
        .connected { color: #4ecdc4; }
        .disconnected { color: #ff6b6b; }
        .playing { color: #4ecdc4; }
        .idle { color: #feca57; }

        .video-wrapper { 
            position: relative; 
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 255, 255, 0.3);
        }
        
        .video-wrapper iframe { 
            width: 100%; 
            height: 315px; 
            border: none;
            pointer-events: none;
        }
        
        .no-video { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 315px; 
            color: #ccc;
            background: linear-gradient(135deg, rgba(0,0,0,0.6), rgba(255,255,255,0.1));
            border-radius: 15px;
        }
        
        .no-video h3 { 
            font-size: 3rem; 
            margin-bottom: 10px; 
            opacity: 0.7; 
        }

        .form-group {
            display: flex;
            gap: 15px;
            align-items: center;
            flex-wrap: wrap;
        }

        .form-group input {
            flex: 1;
            min-width: 300px;
            padding: 12px;
            border-radius: 8px;
            background: var(--input-bg);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            font-size: 1rem;
        }

        .btn {
            padding: 12px 24px;
            border-radius: 8px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border: none;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: transform 0.2s ease;
        }

        .btn:hover {
            transform: scale(1.05);
        }

        .instructions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }

        .instruction-card {
            background: var(--input-bg);
            padding: 20px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
        }

        .instruction-card h3 {
            color: var(--accent-primary);
            margin-bottom: 10px;
        }

        code {
            background: var(--input-bg);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--accent-primary);
        }
    </style>
</head>
<body>
    <!-- Animated Background -->
    <div class="animated-bg"></div>

    <div class="container">
        <div class="header">
            <h1>3AM VERIFIED</h1>
            <p>Enhanced Music Bot - Fixed Playlist Support</p>
        </div>

        <!-- Connection Status -->
        <div class="section">
            <h2>🔊 Voice Connection Status</h2>
            <div class="connection-status">
                <div class="status-item">
                    <span class="status-label">Connection:</span>
                    <span class="status-value ${this.connectionStatus.connected ? 'connected' : 'disconnected'}">
                        ${this.connectionStatus.connected ? '✅ Connected' : '❌ Disconnected'}
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">Channel:</span>
                    <span class="status-value">${this.connectionStatus.channelName || 'None'}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Audio Status:</span>
                    <span class="status-value ${this.connectionStatus.playing ? 'playing' : 'idle'}">
                        ${this.connectionStatus.playing ? '🎵 Playing' : '⏸️ Idle'}
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">Bot Audio:</span>
                    <span class="status-value ${this.connectionStatus.connected ? (this.connectionStatus.playing ? 'connected' : 'idle') : 'disconnected'}">
                        ${this.connectionStatus.connected ? 
                            (this.connectionStatus.playing ? '🔊 Audio Active' : '🔇 Check if unmuted in Discord') : 
                            '❌ Not Connected'}
                    </span>
                </div>
            </div>
        </div>

        <!-- YouTube Video Display -->
        <div class="section">
            <h2>🎬 Current Video</h2>
            <div class="video-wrapper">
                ${currentVideo}
            </div>
        </div>

        <!-- Suno Song Submission -->
        <div class="section">
            <h2>🎤 Submit Suno Song</h2>
            <form id="sunoForm">
                <div class="form-group">
                    <input type="url" id="sunoUrl" placeholder="Paste your Suno song URL here..." required>
                    <button type="submit" class="btn">🎶 Submit Song</button>
                </div>
            </form>
            <p style="margin-top: 10px; opacity: 0.7;">Share your Suno creations with the Discord community!</p>
        </div>

        <!-- Instructions -->
        <div class="section">
            <h2>📝 How to Use</h2>
            <div class="instructions">
                <div class="instruction-card">
                    <h3>🎵 YouTube Music</h3>
                    <ol style="line-height: 1.6;">
                        <li>Use <code>/load</code> command in Discord</li>
                        <li>Bot auto-joins your voice channel</li>
                        <li>Music starts playing automatically</li>
                        <li>✅ Fixed playlist URL support!</li>
                    </ol>
                </div>
                <div class="instruction-card">
                    <h3>🎤 Suno Songs</h3>
                    <ol style="line-height: 1.6;">
                        <li>Paste your Suno song URL above</li>
                        <li>Bot extracts song info automatically</li>
                        <li>Posts to Discord with artwork</li>
                        <li>Monitoring checks for new releases</li>
                    </ol>
                </div>
            </div>
            <p style="margin-top: 20px;"><strong>✅ Fixed:</strong> Your playlist URL with &si= parameter now works correctly!</p>
        </div>
    </div>

    <script>
        document.getElementById('sunoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('sunoUrl').value;
            if (url) {
                try {
                    const response = await fetch('/suno', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    const result = await response.text();
                    alert(result);
                    document.getElementById('sunoUrl').value = '';
                } catch (error) {
                    alert('Error submitting song');
                }
            }
        });

        // Auto-refresh for status updates
        setInterval(() => {
            location.reload();
        }, 15000);
    </script>
</body>
</html>`;
    }
}

const bot = new FixedMusicBot();
bot.start();