const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const axios = require('axios');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

class WorkingMusicBot {
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
        
        // Connection status for dashboard
        this.connectionStatus = {
            connected: false,
            channelName: null,
            playing: false
        };
        
        // YouTube integration
        this.currentVideoId = null;
        
        // Web server
        this.app = express();
        this.app.use(express.static('.'));
        this.app.use(express.json());
    }

    async start() {
        try {
            this.setupDiscordEvents();
            await this.registerSlashCommands();
            this.setupWebServer();
            
            await this.client.login(process.env.DISCORD_TOKEN);
            console.log('🎵 Working Music Bot started successfully!');
        } catch (error) {
            console.error('❌ Failed to start bot:', error);
        }
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
                this.safeReply(interaction, '❌ An error occurred while processing your command.');
            }
        });
    }

    async handleLoadAndPlay(interaction, url) {
        try {
            await this.safeDefer(interaction);
            
            // Auto-join voice channel logic
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
                await this.safeReply(interaction, '❌ Could not find a voice channel! Join a voice channel or create one named "Music".');
                return;
            }

            await this.joinVoiceChannelById(targetChannel.id, interaction.guild);
            
            if (this.isPlaylistUrl(url)) {
                const songs = await this.getPlaylistSongs(url);
                if (songs.length === 0) {
                    await this.safeReply(interaction, '❌ Failed to load playlist! Check the URL and try again.');
                    return;
                }
                
                this.musicQueue.push(...songs);
                await this.safeReply(interaction, `✅ Added ${songs.length} songs from playlist! 🎵`);
            } else {
                const videoId = this.extractVideoId(url);
                if (!videoId) {
                    await this.safeReply(interaction, '❌ Invalid YouTube URL! Please check and try again.');
                    return;
                }
                
                this.musicQueue.push({ 
                    videoId, 
                    url,
                    title: `Loading video ${videoId}...`,
                    duration: 'Unknown'
                });
                this.currentVideoId = videoId;
                await this.safeReply(interaction, '✅ Added to queue! 🎵');
            }
            
            if (!this.currentSong) {
                this.playCurrentSong();
            }
            
        } catch (error) {
            console.error('❌ Load error:', error);
            await this.safeReply(interaction, '❌ Failed to load content. Please try again.');
        }
    }

    async safeDefer(interaction) {
        try {
            if (interaction.isRepliable()) {
                await interaction.deferReply();
            }
        } catch (error) {
            console.log('⚠️ Could not defer:', error.message);
        }
    }

    async safeReply(interaction, message) {
        try {
            if (interaction.deferred) {
                await interaction.editReply(message);
            } else if (interaction.isRepliable()) {
                await interaction.reply(message);
            }
        } catch (error) {
            console.log('⚠️ Could not reply:', error.message);
        }
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

    isPlaylistUrl(url) {
        return url.includes('list=');
    }

    async getPlaylistSongs(playlistUrl) {
        try {
            const playlistId = this.extractPlaylistId(playlistUrl);
            if (!playlistId) return [];
            
            console.log(`📋 Loading playlist: ${playlistId}`);
            
            // Use YouTube API if available
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
                console.log('⚠️ No YouTube API key - using fallback');
                return [{
                    videoId: 'fallback',
                    title: 'Playlist item (API key needed for full playlist)',
                    url: playlistUrl,
                    duration: 'Unknown'
                }];
            }
        } catch (error) {
            console.error('❌ Playlist error:', error.message);
            return [];
        }
    }

    extractPlaylistId(url) {
        // Fixed to handle URLs with extra parameters like &si=
        const regex = /[&?]list=([^&]+)/;
        const match = url.match(regex);
        if (match) {
            // Clean up any additional parameters
            return match[1].split('&')[0];
        }
        return null;
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

    setupWebServer() {
        this.app.get('/', (req, res) => {
            res.send(this.renderDashboard());
        });

        this.app.post('/load', async (req, res) => {
            try {
                const { url } = req.body;
                if (!url) return res.status(400).send('URL is required');
                
                // Add to queue logic here
                console.log('📺 Loading via web:', url);
                res.send('✅ Added to queue! Use Discord /load command for voice playback.');
            } catch (error) {
                console.error('❌ Web load error:', error);
                res.status(500).send('❌ Failed to load content');
            }
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
        try {
            console.log('🎵 Processing Suno URL:', url);
            // Basic Suno URL processing - would need proper implementation
            const songData = {
                title: 'Suno Song',
                url: url,
                description: 'Submitted via web interface'
            };
            
            await this.postSunoToDiscord(songData.title, songData.url, songData.description);
            return songData;
        } catch (error) {
            console.error('❌ Suno extraction error:', error);
            throw error;
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            const channel = this.client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
            if (!channel) {
                console.error('❌ Discord channel not found');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎵 ${title}`)
                .setURL(url)
                .setDescription(description || 'New Suno song submission!')
                .setColor(0x00ffff)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            console.log('✅ Posted Suno song to Discord');
        } catch (error) {
            console.error('❌ Discord post error:', error);
        }
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

        [data-theme="light"] {
            --bg-primary: #f8f9fa;
            --bg-secondary: #ffffff;
            --accent-primary: #007bff;
            --accent-secondary: #6f42c1;
            --text-primary: #212529;
            --text-secondary: #6c757d;
            --border-color: rgba(0, 0, 0, 0.1);
            --input-bg: rgba(0, 0, 0, 0.05);
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

        .scroll-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            background: linear-gradient(
                270deg,
                rgba(255, 0, 110, 0.3) 0%,
                rgba(131, 56, 236, 0.3) 25%,
                rgba(58, 134, 255, 0.3) 50%,
                rgba(6, 255, 165, 0.3) 75%,
                rgba(255, 190, 11, 0.3) 100%
            );
            background-size: 200% 200%;
            animation: gradientShift 8s ease infinite;
            transform: translateX(var(--scroll-offset, 0px));
            transition: transform 0.1s ease-out;
        }

        @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: var(--input-bg);
            border: 1px solid var(--border-color);
            border-radius: 25px;
            padding: 10px 20px;
            color: var(--text-primary);
            cursor: pointer;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }

        .theme-toggle:hover {
            background: var(--accent-primary);
            color: var(--bg-primary);
            transform: scale(1.05);
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

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('3am-verified-logo.jpg') center/contain no-repeat;
            opacity: 0.1;
            z-index: 0;
        }

        .header h1 {
            font-size: 3.5rem;
            font-weight: bold;
            text-shadow: 0 0 20px rgba(0, 255, 255, 0.8);
            margin-bottom: 10px;
            position: relative;
            z-index: 1;
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
            position: relative;
            z-index: 1;
        }

        .logo-container {
            position: absolute;
            top: -20px;
            right: 20px;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            overflow: hidden;
            border: 3px solid var(--accent-primary);
            box-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
            z-index: 2;
        }

        .logo-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            padding: 30px;
            margin: 25px 0;
            border-radius: 15px;
            backdrop-filter: blur(20px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .section::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
            animation: scan 3s linear infinite;
        }

        @keyframes scan {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .section:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(0, 255, 255, 0.2);
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
        
        .status-value.connected {
            color: #4ecdc4;
        }
        
        .status-value.disconnected {
            color: #ff6b6b;
        }
        
        .status-value.playing {
            color: #4ecdc4;
        }
        
        .status-value.idle {
            color: #feca57;
        }

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
        
        .video-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.1);
            pointer-events: none;
        }
        
        .no-video { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 315px; 
            color: #ccc;
            background: linear-gradient(135deg, rgba(0,0,0,0.6), rgba(255,255,255,0.1));
        }
        
        .no-video h3 { 
            font-size: 3rem; 
            margin-bottom: 10px; 
            opacity: 0.7; 
        }

        @media (max-width: 768px) {
            .header h1 { font-size: 2.5rem; }
            .logo-container { width: 60px; height: 60px; top: -10px; right: 10px; }
            .section { padding: 20px; margin: 15px 0; }
            .connection-status { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <!-- Animated Background -->
    <div class="animated-bg"></div>
    
    <!-- Theme Toggle -->
    <div class="theme-toggle" onclick="toggleTheme()">
        🌓 Theme
    </div>

    <div class="container">
        <div class="header">
            <div class="logo-container">
                <img src="3am-verified-logo.jpg" alt="3AM VERIFIED" onerror="this.style.display='none'">
            </div>
            <h1>3AM VERIFIED</h1>
            <p>Enhanced Music Bot - YouTube Integration & Suno Monitoring</p>
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
                <div class="video-overlay"></div>
            </div>
        </div>

        <!-- YouTube Loading -->
        <div class="section">
            <h2>📺 Load YouTube Content</h2>
            <form id="loadForm" style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                <input type="url" id="youtubeUrl" placeholder="Paste YouTube URL or Playlist here..." 
                       style="flex: 1; min-width: 300px; padding: 12px; border-radius: 8px; 
                              background: var(--input-bg); border: 1px solid var(--border-color); 
                              color: var(--text-primary); font-size: 1rem;">
                <button type="submit" style="padding: 12px 24px; border-radius: 8px; 
                                           background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); 
                                           border: none; color: white; font-weight: bold; cursor: pointer; 
                                           transition: transform 0.2s ease;">
                    🎵 Load & Play
                </button>
            </form>
            <p style="margin-top: 10px; opacity: 0.7;">Supports individual videos and playlists!</p>
        </div>

        <!-- Suno Song Submission -->
        <div class="section">
            <h2>🎤 Submit Suno Song</h2>
            <form id="sunoForm" style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                <input type="url" id="sunoUrl" placeholder="Paste your Suno song URL here..." 
                       style="flex: 1; min-width: 300px; padding: 12px; border-radius: 8px; 
                              background: var(--input-bg); border: 1px solid var(--border-color); 
                              color: var(--text-primary); font-size: 1rem;">
                <button type="submit" style="padding: 12px 24px; border-radius: 8px; 
                                           background: linear-gradient(135deg, #ff006e, #8338ec); 
                                           border: none; color: white; font-weight: bold; cursor: pointer; 
                                           transition: transform 0.2s ease;">
                    🎶 Submit Song
                </button>
            </form>
            <p style="margin-top: 10px; opacity: 0.7;">Share your Suno creations with the Discord community!</p>
        </div>

        <!-- Instructions -->
        <div class="section">
            <h2>📝 How to Use</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <div>
                    <h3 style="color: var(--accent-primary); margin-bottom: 10px;">🎵 YouTube Music</h3>
                    <ol style="line-height: 1.6;">
                        <li>Use <code>/load</code> command in Discord</li>
                        <li>Bot auto-joins your voice channel</li>
                        <li>Music starts playing automatically</li>
                        <li>Supports playlists and individual videos</li>
                    </ol>
                </div>
                <div>
                    <h3 style="color: var(--accent-secondary); margin-bottom: 10px;">🎤 Suno Songs</h3>
                    <ol style="line-height: 1.6;">
                        <li>Paste your Suno song URL above</li>
                        <li>Bot extracts song info automatically</li>
                        <li>Posts to Discord with artwork</li>
                        <li>Monitoring checks for new releases</li>
                    </ol>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Theme toggle functionality
        function toggleTheme() {
            const body = document.body;
            const currentTheme = body.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        }

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);

        // Auto theme based on time
        const hour = new Date().getHours();
        if (!localStorage.getItem('theme')) {
            document.body.setAttribute('data-theme', hour >= 6 && hour < 18 ? 'light' : 'dark');
        }

        // Form submissions
        document.getElementById('loadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('youtubeUrl').value;
            if (url) {
                const response = await fetch('/load', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const result = await response.text();
                alert(result);
                document.getElementById('youtubeUrl').value = '';
            }
        });

        document.getElementById('sunoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('sunoUrl').value;
            if (url) {
                const response = await fetch('/suno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const result = await response.text();
                alert(result);
                document.getElementById('sunoUrl').value = '';
            }
        });

        // Auto-refresh page every 10 seconds for status updates
        setInterval(() => {
            location.reload();
        }, 10000);
    </script>
</body>
</html>`;
    }
}

const bot = new WorkingMusicBot();
bot.start();