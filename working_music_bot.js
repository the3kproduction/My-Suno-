const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const axios = require('axios');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

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

        this.app.listen(5000, '0.0.0.0', () => {
            console.log('🌟 Web server running on port 5000');
        });
    }

    renderDashboard() {
        const currentVideo = this.currentVideoId ? 
            `<iframe width="560" height="315" src="https://www.youtube.com/embed/${this.currentVideoId}" frameborder="0" allowfullscreen></iframe>` :
            '<div class="no-video"><h3>No video playing</h3></div>';

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Working Music Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Arial', sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; }
        .section { 
            background: rgba(255,255,255,0.1); 
            padding: 30px; 
            margin: 20px 0; 
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .connection-status {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .status-item {
            background: rgba(255,255,255,0.2);
            padding: 15px;
            border-radius: 10px;
        }
        .status-label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
            opacity: 0.8;
        }
        .status-value {
            font-size: 1.1rem;
            font-weight: bold;
        }
        .connected { color: #4ecdc4; }
        .disconnected { color: #ff6b6b; }
        .playing { color: #4ecdc4; }
        .idle { color: #feca57; }
        .video-wrapper { position: relative; }
        iframe { width: 100%; height: 315px; border-radius: 10px; }
        .no-video { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 315px; 
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎵 Working Music Bot</h1>
            <p>Fixed YouTube Playlist Loading & Error Handling</p>
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

        <!-- Instructions -->
        <div class="section">
            <h2>📝 How to Use</h2>
            <ol>
                <li>Type <code>/load</code> in Discord with your YouTube URL</li>
                <li>Bot will auto-join your voice channel (or find Music/General)</li>
                <li>Music starts playing automatically</li>
                <li>Check connection status above for troubleshooting</li>
            </ol>
            <p><strong>Fixed:</strong> YouTube playlist URLs with extra parameters now work correctly!</p>
        </div>
    </div>
</body>
</html>`;
    }
}

const bot = new WorkingMusicBot();
bot.start();