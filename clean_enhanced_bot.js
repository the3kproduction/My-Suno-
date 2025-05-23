const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ChannelType, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

class EnhancedMusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates
            ]
        });

        this.app = express();
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Channel configuration
        this.channels = {
            music: {
                id: '1375476962356887614', // Music Videos Channel
                playlist: [],
                currentIndex: 0,
                player: null,
                connection: null,
                isPlaying: false
            },
            lyric: {
                id: '1375476842261385289', // Lyric Videos Channel  
                playlist: [],
                currentIndex: 0,
                player: null,
                connection: null,
                isPlaying: false
            }
        };

        this.sunoChannelId = process.env.DISCORD_CHANNEL_ID;
    }

    async start() {
        try {
            console.log('🚀 Starting Enhanced Music Bot...');
            
            // Register slash commands
            await this.registerSlashCommands();
            
            // Setup Discord events
            this.setupDiscordEvents();
            
            // Setup web server
            this.setupWebServer();
            
            // Login to Discord
            await this.client.login(process.env.DISCORD_TOKEN);
            
        } catch (error) {
            console.error('❌ Failed to start bot:', error);
        }
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('load')
                .setDescription('Load YouTube playlist or video')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('YouTube URL')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('Channel type')
                        .setRequired(true)
                        .addChoices(
                            { name: '🎬 Music Videos', value: 'music' },
                            { name: '🎤 Lyric Videos', value: 'lyric' }
                        )),
            
            new SlashCommandBuilder()
                .setName('play')
                .setDescription('Start playing music')
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('Channel type')
                        .setRequired(true)
                        .addChoices(
                            { name: '🎬 Music Videos', value: 'music' },
                            { name: '🎤 Lyric Videos', value: 'lyric' }
                        )),
            
            new SlashCommandBuilder()
                .setName('skip')
                .setDescription('Skip to next song')
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('Channel type')
                        .setRequired(true)
                        .addChoices(
                            { name: '🎬 Music Videos', value: 'music' },
                            { name: '🎤 Lyric Videos', value: 'lyric' }
                        )),
            
            new SlashCommandBuilder()
                .setName('stop')
                .setDescription('Stop music and leave voice channel')
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('Channel type')
                        .setRequired(true)
                        .addChoices(
                            { name: '🎬 Music Videos', value: 'music' },
                            { name: '🎤 Lyric Videos', value: 'lyric' }
                        ))
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        // Wait for bot to be ready before registering commands
        this.client.once('ready', async () => {
            try {
                await rest.put(
                    Routes.applicationCommands(this.client.user.id),
                    { body: commands }
                );
                console.log('✅ Slash commands registered!');
            } catch (error) {
                console.error('❌ Error registering commands:', error);
            }
        });
    }

    setupDiscordEvents() {
        this.client.once('ready', () => {
            console.log(`🎵 Bot logged in as ${this.client.user.tag}`);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName, options } = interaction;
            const channelType = options.getString('channel');

            try {
                switch (commandName) {
                    case 'load':
                        await this.handleLoad(interaction, options.getString('url'), channelType);
                        break;
                    case 'play':
                        await this.handlePlay(interaction, channelType);
                        break;
                    case 'skip':
                        await this.handleSkip(interaction, channelType);
                        break;
                    case 'stop':
                        await this.handleStop(interaction, channelType);
                        break;
                }
            } catch (error) {
                console.error('❌ Command error:', error);
                await interaction.reply({ content: '❌ Something went wrong!', ephemeral: true });
            }
        });
    }

    async handleLoad(interaction, url, channelType) {
        await interaction.deferReply();
        
        try {
            // Check if it's a playlist or single video
            if (url.includes('playlist?list=')) {
                // Handle playlist
                const songs = await this.getPlaylistSongs(url);
                this.channels[channelType].playlist = songs;
                this.channels[channelType].currentIndex = 0;
                
                await interaction.editReply(`✅ Loaded playlist with ${songs.length} songs in ${channelType} channel!`);
            } else {
                // Handle single video
                const videoId = this.extractVideoId(url);
                const info = await ytdl.getInfo(url);
                const song = {
                    title: info.videoDetails.title,
                    url: url,
                    id: videoId
                };

                this.channels[channelType].playlist.push(song);
                await interaction.editReply(`✅ Loaded: **${song.title}** in ${channelType} channel!`);
            }
            
            // Join voice channel and start playing
            await this.joinVoiceChannel(interaction, channelType);
            await this.playCurrentSong(channelType);

        } catch (error) {
            console.error('❌ Load error:', error);
            await interaction.editReply('❌ Failed to load the content! Make sure the URL is valid.');
        }
    }

    extractVideoId(url) {
        const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async getPlaylistSongs(playlistUrl) {
        // Extract playlist ID
        const playlistId = this.extractPlaylistId(playlistUrl);
        if (!playlistId) throw new Error('Invalid playlist URL');

        // Use YouTube Data API to get playlist items
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            throw new Error('YouTube API key not configured');
        }

        try {
            const response = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
                params: {
                    part: 'snippet',
                    playlistId: playlistId,
                    maxResults: 50,
                    key: apiKey
                }
            });

            return response.data.items
                .filter(item => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
                .map(item => ({
                    title: item.snippet.title,
                    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
                    id: item.snippet.resourceId.videoId
                }));
        } catch (error) {
            console.error('❌ YouTube API error:', error);
            throw new Error('Failed to load playlist. Check your YouTube API key.');
        }
    }

    extractPlaylistId(url) {
        const regex = /[&?]list=([^&]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async handlePlay(interaction, channelType) {
        if (this.channels[channelType].playlist.length === 0) {
            await interaction.reply('❌ No songs in playlist! Use `/load` first.');
            return;
        }

        await this.joinVoiceChannel(interaction, channelType);
        await this.playCurrentSong(channelType);
        
        const current = this.channels[channelType].playlist[this.channels[channelType].currentIndex];
        await interaction.reply(`▶️ Playing: **${current.title}** in ${channelType} channel!`);
    }

    async handleSkip(interaction, channelType) {
        const channel = this.channels[channelType];
        
        if (channel.playlist.length === 0) {
            await interaction.reply('❌ No songs to skip!');
            return;
        }

        // Move to next song
        channel.currentIndex = (channel.currentIndex + 1) % channel.playlist.length;
        await this.playCurrentSong(channelType);
        
        const current = channel.playlist[channel.currentIndex];
        await interaction.reply(`⏭️ Skipped to: **${current.title}**`);
    }

    async handleStop(interaction, channelType) {
        const channel = this.channels[channelType];
        
        if (channel.connection) {
            channel.connection.destroy();
            channel.connection = null;
        }
        
        if (channel.player) {
            channel.player.stop();
        }
        
        channel.isPlaying = false;
        await interaction.reply(`⏹️ Stopped music in ${channelType} channel!`);
    }

    async joinVoiceChannel(interaction, channelType) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            throw new Error('You need to be in a voice channel!');
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        this.channels[channelType].connection = connection;
        return connection;
    }

    async playCurrentSong(channelType) {
        const channel = this.channels[channelType];
        const song = channel.playlist[channel.currentIndex];

        if (!song || !channel.connection) return;

        try {
            const stream = ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio' });
            const resource = createAudioResource(stream);
            
            const player = createAudioPlayer();
            channel.player = player;
            
            player.play(resource);
            channel.connection.subscribe(player);
            channel.isPlaying = true;

            // Auto-skip when song ends
            player.on(AudioPlayerStatus.Idle, () => {
                channel.currentIndex = (channel.currentIndex + 1) % channel.playlist.length;
                setTimeout(() => this.playCurrentSong(channelType), 2000);
            });

            console.log(`🎵 Playing: ${song.title} in ${channelType} channel`);
        } catch (error) {
            console.error('❌ Playback error:', error);
        }
    }

    setupWebServer() {
        // Main dashboard
        this.app.get('/', (req, res) => {
            const musicSong = this.channels.music.playlist[this.channels.music.currentIndex];
            const lyricSong = this.channels.lyric.playlist[this.channels.lyric.currentIndex];

            res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Enhanced Music Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        
        @keyframes rainbowGlow {
            0% { 
                box-shadow: 0 0 30px #ff6b6b, 0 0 60px #ff6b6b, 0 0 90px #ff6b6b;
                filter: hue-rotate(0deg);
            }
            25% { 
                box-shadow: 0 0 30px #4ecdc4, 0 0 60px #4ecdc4, 0 0 90px #4ecdc4;
                filter: hue-rotate(90deg);
            }
            50% { 
                box-shadow: 0 0 30px #667eea, 0 0 60px #667eea, 0 0 90px #667eea;
                filter: hue-rotate(180deg);
            }
            75% { 
                box-shadow: 0 0 30px #764ba2, 0 0 60px #764ba2, 0 0 90px #764ba2;
                filter: hue-rotate(270deg);
            }
            100% { 
                box-shadow: 0 0 30px #ff6b6b, 0 0 60px #ff6b6b, 0 0 90px #ff6b6b;
                filter: hue-rotate(360deg);
            }
        }
        
        @keyframes megaPulse {
            0%, 100% { 
                transform: scale(1) rotate(0deg); 
                filter: brightness(1);
            }
            50% { 
                transform: scale(1.1) rotate(2deg); 
                filter: brightness(1.3);
            }
        }
        
        @keyframes textShimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(-45deg, #667eea, #764ba2, #ff6b6b, #4ecdc4);
            background-size: 400% 400%;
            animation: gradient 15s ease infinite;
            min-height: 100vh; color: white; padding: 20px;
        }
        
        .container { max-width: 1200px; margin: 0 auto; }
        
        .header { 
            text-align: center; margin-bottom: 60px; 
            animation: megaPulse 4s ease-in-out infinite;
        }
        
        .header h1 { 
            font-size: 4rem; margin-bottom: 20px; 
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #667eea, #764ba2, #ff6b6b);
            background-size: 400% 400%;
            animation: gradient 2s ease infinite, rainbowGlow 3s ease infinite;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 0 20px rgba(255,255,255,0.8)) drop-shadow(0 10px 20px rgba(0,0,0,0.5));
        }
        
        .header p {
            font-size: 1.3rem;
            background: linear-gradient(90deg, transparent, #fff, transparent);
            background-size: 200% 100%;
            animation: textShimmer 2s infinite;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .section {
            background: rgba(255,255,255,0.2); 
            border-radius: 25px;
            padding: 40px; margin-bottom: 50px; 
            backdrop-filter: blur(20px);
            border: 2px solid rgba(255,255,255,0.3);
            box-shadow: 0 15px 50px rgba(0,0,0,0.2);
            transition: all 0.4s ease;
            animation: float 6s ease-in-out infinite;
        }
        
        .section:hover {
            transform: translateY(-15px) scale(1.02);
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
            animation: rainbowGlow 1s ease infinite;
        }
        
        .section h2 {
            font-size: 3rem; margin-bottom: 50px; 
            text-align: center;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #667eea, #764ba2, #ff6b6b);
            background-size: 500% 500%;
            animation: gradient 3s ease infinite, megaPulse 4s ease infinite;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 0 30px rgba(255,255,255,0.9)) drop-shadow(0 15px 30px rgba(0,0,0,0.6));
            transform: perspective(800px) rotateX(20deg);
            text-shadow: 0 0 50px rgba(255,255,255,0.8);
        }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 40px; }
        
        .video-container {
            background: rgba(0,0,0,0.4); 
            border-radius: 15px; overflow: hidden;
            animation: glow 4s ease-in-out infinite;
            transition: all 0.3s ease;
            border: 2px solid rgba(255,255,255,0.1);
        }
        
        .video-container:hover {
            transform: scale(1.02);
            border-color: rgba(255,107,107,0.5);
        }
        
        .video-container h3 { 
            padding: 20px; font-size: 1.4rem; 
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4);
            margin: 0;
            text-align: center;
            font-weight: 700;
            text-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .video-wrapper { 
            height: 315px; background: #000; 
            position: relative;
            overflow: hidden;
        }
        
        .video-wrapper iframe { 
            width: 100%; height: 100%; border: none; 
            transition: all 0.3s ease;
        }
        
        .video-wrapper:hover iframe {
            transform: scale(1.05);
        }
        
        .no-video {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 315px; color: #ccc;
            background: linear-gradient(135deg, rgba(0,0,0,0.6), rgba(255,255,255,0.1));
        }
        
        .no-video h3 { font-size: 3rem; margin-bottom: 10px; opacity: 0.7; }
        
        .form-group { margin-bottom: 25px; }
        
        .form-group label { 
            display: block; margin-bottom: 10px; font-weight: 700; 
            font-size: 1.1rem;
            color: #fff;
            text-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .form-group input, .form-group textarea {
            width: 100%; padding: 15px; border: none; border-radius: 12px;
            font-size: 16px; background: rgba(255,255,255,0.95);
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .form-group input:focus, .form-group textarea:focus {
            outline: none;
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(78, 205, 196, 0.3);
            background: rgba(255,255,255,1);
        }
        
        .btn {
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4); 
            color: white;
            border: none; padding: 15px 30px; border-radius: 12px;
            font-size: 18px; font-weight: 700; cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .btn:hover { 
            transform: translateY(-3px) scale(1.05); 
            box-shadow: 0 10px 25px rgba(255, 107, 107, 0.4);
            animation: glow 1s ease-in-out infinite;
        }
        
        .commands { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
            gap: 20px; 
        }
        
        .command { 
            background: rgba(255,255,255,0.15); 
            padding: 20px; border-radius: 12px; 
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .command:hover {
            background: rgba(255,255,255,0.25);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.15);
        }
        
        .command h4 {
            color: #4ecdc4;
            font-size: 1.2rem;
            margin-bottom: 8px;
            text-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .status-text {
            padding: 12px; 
            border-radius: 8px; 
            font-weight: 600;
            text-align: center;
            margin-top: 10px;
        }
        
        @media (max-width: 768px) {
            .header h1 { font-size: 2.5rem; }
            .grid { grid-template-columns: 1fr; gap: 20px; }
            .section { padding: 25px; margin-bottom: 25px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎵 Enhanced Music Bot</h1>
            <p>Suno Song Posting & YouTube Voice Channels</p>
        </div>

        <!-- Live Video Streams -->
        <div class="section">
            <h2>🎬 Live Video Streams</h2>
            <div class="grid">
                <div class="video-container">
                    <h3>🎬 Music Videos Channel</h3>
                    <div class="video-wrapper">
                        ${musicSong ? `
                            <iframe src="https://www.youtube.com/embed/${musicSong.id}?autoplay=1&mute=1&controls=0" 
                                    allow="autoplay; encrypted-media"></iframe>
                        ` : `
                            <div class="no-video">
                                <h3>🎬</h3>
                                <p>No video playing</p>
                                <p>Use /load command in Discord</p>
                            </div>
                        `}
                    </div>
                    <p style="padding: 10px;">${musicSong ? musicSong.title : 'No song loaded'}</p>
                </div>

                <div class="video-container">
                    <h3>🎤 Lyric Videos Channel</h3>
                    <div class="video-wrapper">
                        ${lyricSong ? `
                            <iframe src="https://www.youtube.com/embed/${lyricSong.id}?autoplay=1&mute=1&controls=0" 
                                    allow="autoplay; encrypted-media"></iframe>
                        ` : `
                            <div class="no-video">
                                <h3>🎤</h3>
                                <p>No video playing</p>
                                <p>Use /load command in Discord</p>
                            </div>
                        `}
                    </div>
                    <p style="padding: 10px;">${lyricSong ? lyricSong.title : 'No song loaded'}</p>
                </div>
            </div>
        </div>

        <!-- YouTube Music Loading -->
        <div class="section">
            <h2>🎥 Load YouTube Music</h2>
            <form id="youtubeForm">
                <div class="form-group">
                    <label>YouTube URL (Video or Playlist)</label>
                    <input type="url" id="youtubeUrl" placeholder="https://youtube.com/watch?v=... or https://youtube.com/playlist?list=..." required>
                </div>
                <div class="form-group">
                    <label>Channel Type</label>
                    <select id="channelType" required>
                        <option value="">Select Channel</option>
                        <option value="music">🎬 Music Videos</option>
                        <option value="lyric">🎤 Lyric Videos</option>
                    </select>
                </div>
                <button type="submit" class="btn">🎵 Load & Start Playing</button>
            </form>
            <div id="youtubeStatus" style="margin-top: 15px;"></div>
        </div>

        <!-- Suno Song Posting -->
        <div class="section">
            <h2>🎵 Post Suno Song</h2>
            <form id="sunoForm">
                <div class="form-group">
                    <label>Suno Song URL</label>
                    <input type="url" id="sunoUrl" placeholder="https://suno.com/song/..." required>
                </div>
                <div class="form-group">
                    <label>Description (Optional)</label>
                    <textarea id="description" placeholder="Add a description..."></textarea>
                </div>
                <button type="submit" class="btn">🎵 Post to Discord</button>
            </form>
            <div id="status" style="margin-top: 15px;"></div>
        </div>

        <!-- Discord Commands -->
        <div class="section">
            <h2>🎮 Discord Commands</h2>
            <div class="commands">
                <div class="command">
                    <h4>/load [url] [channel]</h4>
                    <p>Load YouTube video/playlist</p>
                </div>
                <div class="command">
                    <h4>/play [channel]</h4>
                    <p>Start playing music</p>
                </div>
                <div class="command">
                    <h4>/skip [channel]</h4>
                    <p>Skip to next song</p>
                </div>
                <div class="command">
                    <h4>/stop [channel]</h4>
                    <p>Stop music & leave voice</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        // YouTube form submission
        document.getElementById('youtubeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('youtubeStatus');
            
            try {
                const response = await fetch('/load-youtube', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: document.getElementById('youtubeUrl').value,
                        channelType: document.getElementById('channelType').value
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                    document.getElementById('youtubeForm').reset();
                } else {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                }
            } catch (error) {
                status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to load YouTube content</p>';
            }
        });

        // Suno form submission
        document.getElementById('sunoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('status');
            
            try {
                const response = await fetch('/post-suno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: document.getElementById('sunoUrl').value,
                        description: document.getElementById('description').value
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '<p style="color: #4ecdc4;">✅ Song posted successfully!</p>';
                    document.getElementById('sunoForm').reset();
                } else {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                }
            } catch (error) {
                status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to post song</p>';
            }
        });

        // Auto refresh every 30 seconds
        setInterval(() => location.reload(), 30000);
    </script>
</body>
</html>
            `);
        });

        // YouTube loading endpoint
        this.app.post('/load-youtube', async (req, res) => {
            try {
                const { url, channelType } = req.body;
                
                if (!url || !channelType) {
                    return res.json({ success: false, error: 'URL and channel type are required' });
                }

                if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
                    return res.json({ success: false, error: 'Please provide a valid YouTube URL' });
                }

                // Load the content
                if (url.includes('playlist?list=')) {
                    // Handle playlist
                    const songs = await this.getPlaylistSongs(url);
                    this.channels[channelType].playlist = songs;
                    this.channels[channelType].currentIndex = 0;
                    
                    res.json({ 
                        success: true, 
                        message: `Loaded playlist with ${songs.length} songs in ${channelType} channel!` 
                    });
                } else {
                    // Handle single video
                    const videoId = this.extractVideoId(url);
                    const info = await ytdl.getInfo(url);
                    const song = {
                        title: info.videoDetails.title,
                        url: url,
                        id: videoId
                    };

                    this.channels[channelType].playlist.push(song);
                    res.json({ 
                        success: true, 
                        message: `Loaded: ${song.title} in ${channelType} channel!` 
                    });
                }

                // Auto-start playing if not already playing
                if (!this.channels[channelType].isPlaying) {
                    setTimeout(() => this.playCurrentSong(channelType), 1000);
                }

            } catch (error) {
                console.error('❌ YouTube loading error:', error);
                res.json({ success: false, error: 'Failed to load YouTube content. Make sure the URL is valid.' });
            }
        });

        // Suno posting endpoint
        this.app.post('/post-suno', async (req, res) => {
            try {
                const { url, description = '' } = req.body;
                
                if (!url || !url.includes('suno.com')) {
                    return res.json({ success: false, error: 'Please provide a valid Suno URL' });
                }

                // Extract song title from URL
                const songData = await this.extractSunoData(url);
                
                // Post to Discord
                await this.postSunoToDiscord(songData.title, url, description);
                
                res.json({ success: true });
            } catch (error) {
                console.error('❌ Suno posting error:', error);
                res.json({ success: false, error: 'Failed to post song' });
            }
        });

        // Start server
        this.app.listen(5000, () => {
            console.log('🌟 Web server running on port 5000');
        });
    }

    async extractSunoData(url) {
        try {
            // Get page content to extract song data
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const html = response.data;
            
            // Extract title from meta tags or title
            let title = 'Unknown Song';
            
            // Try OpenGraph title first
            const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]*)"[^>]*>/i);
            if (ogTitleMatch) {
                title = ogTitleMatch[1];
            } else {
                // Fallback to page title
                const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                if (titleMatch) {
                    title = titleMatch[1].replace(' | Suno', '').trim();
                }
            }
            
            // Extract image URL for thumbnail
            let imageUrl = null;
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]*)"[^>]*>/i);
            if (ogImageMatch) {
                imageUrl = ogImageMatch[1];
            }
            
            // Extract description
            let description = '';
            const ogDescMatch = html.match(/<meta property="og:description" content="([^"]*)"[^>]*>/i);
            if (ogDescMatch) {
                description = ogDescMatch[1];
            }
            
            return { 
                title: title.trim(), 
                url, 
                imageUrl,
                description: description.trim()
            };
        } catch (error) {
            console.error('❌ Error extracting Suno data:', error);
            return { title: 'Unknown Song', url, imageUrl: null, description: '' };
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            const channel = await this.client.channels.fetch(this.sunoChannelId);
            
            // Get song data with artwork
            const songData = await this.extractSunoData(url);
            
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Suno', iconURL: 'https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld' })
                .setTitle(songData.title)
                .setURL(url)
                .setColor('#4F46E5')
                .setTimestamp();

            // Add image if available
            if (songData.imageUrl) {
                embed.setImage(songData.imageUrl);
            }

            // Add description if available
            if (songData.description || description) {
                embed.setDescription(songData.description || description);
            }

            const message = `🎵 New Suno song: **${songData.title}** — ${url}`;
            
            await channel.send({ content: message, embeds: [embed] });
            console.log(`✅ Posted to Discord: ${songData.title}`);
        } catch (error) {
            console.error('❌ Discord posting error:', error);
            throw error;
        }
    }
}

// Start the bot
const bot = new EnhancedMusicBot();
bot.start().catch(console.error);