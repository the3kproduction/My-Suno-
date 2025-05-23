const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const axios = require('axios');
const express = require('express');
const path = require('path');

// Enhanced Music Bot - Render Deployment Version
class EnhancedMusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent
            ]
        });

        this.app = express();
        this.app.use(express.json());
        this.app.use(express.static('public'));

        // Playlist management for both channels
        this.currentPlaylists = {
            music: {
                songs: [],
                currentIndex: 0,
                connection: null,
                player: null,
                isPlaying: false
            },
            lyric: {
                songs: [],
                currentIndex: 0,
                connection: null,
                player: null,
                isPlaying: false
            }
        };

        this.config = {
            discord: {
                token: process.env.DISCORD_TOKEN,
                musicVideoChannelId: '1375476962356887614',
                lyricVideoChannelId: '1375476842261385289',
                targetChannelId: process.env.DISCORD_CHANNEL_ID
            },
            youtube: {
                apiKey: process.env.YOUTUBE_API_KEY
            },
            suno: {
                profileId: process.env.SUNO_PROFILE_ID
            }
        };
    }

    async start() {
        console.log('🎵 Enhanced Music Bot starting...');
        
        this.setupEventHandlers();
        await this.registerSlashCommands();
        this.setupWebServer();
        
        await this.client.login(this.config.discord.token);
        console.log('🎵 Enhanced Music Bot logged in successfully');
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log('🚀 Enhanced Music Bot ready!');
            console.log(`🎵 Bot logged in as ${this.client.user.tag}`);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleSlashCommand(interaction);
        });

        this.client.on('error', console.error);
    }

    async registerSlashCommands() {
        const commands = [
            {
                name: 'play',
                description: 'Start playing music',
                options: [
                    {
                        name: 'channel',
                        description: 'Choose music or lyric channel',
                        type: 3,
                        required: true,
                        choices: [
                            { name: 'Music Videos', value: 'music' },
                            { name: 'Lyric Videos', value: 'lyric' }
                        ]
                    }
                ]
            },
            {
                name: 'pause',
                description: 'Pause music playback',
                options: [
                    {
                        name: 'channel',
                        description: 'Choose music or lyric channel',
                        type: 3,
                        required: true,
                        choices: [
                            { name: 'Music Videos', value: 'music' },
                            { name: 'Lyric Videos', value: 'lyric' }
                        ]
                    }
                ]
            },
            {
                name: 'skip',
                description: 'Skip to next song',
                options: [
                    {
                        name: 'channel',
                        description: 'Choose music or lyric channel',
                        type: 3,
                        required: true,
                        choices: [
                            { name: 'Music Videos', value: 'music' },
                            { name: 'Lyric Videos', value: 'lyric' }
                        ]
                    }
                ]
            },
            {
                name: 'stop',
                description: 'Stop music and leave voice channel',
                options: [
                    {
                        name: 'channel',
                        description: 'Choose music or lyric channel',
                        type: 3,
                        required: true,
                        choices: [
                            { name: 'Music Videos', value: 'music' },
                            { name: 'Lyric Videos', value: 'lyric' }
                        ]
                    }
                ]
            },
            {
                name: 'queue',
                description: 'Show current playlist',
                options: [
                    {
                        name: 'channel',
                        description: 'Choose music or lyric channel',
                        type: 3,
                        required: true,
                        choices: [
                            { name: 'Music Videos', value: 'music' },
                            { name: 'Lyric Videos', value: 'lyric' }
                        ]
                    }
                ]
            },
            {
                name: 'load',
                description: 'Load YouTube playlist or single video',
                options: [
                    {
                        name: 'url',
                        description: 'YouTube playlist or video URL',
                        type: 3,
                        required: true
                    },
                    {
                        name: 'channel',
                        description: 'Choose music or lyric channel',
                        type: 3,
                        required: true,
                        choices: [
                            { name: 'Music Videos', value: 'music' },
                            { name: 'Lyric Videos', value: 'lyric' }
                        ]
                    }
                ]
            }
        ];

        const rest = new REST({ version: '10' }).setToken(this.config.discord.token);

        try {
            // Wait for client to be ready before registering commands
            if (!this.client.application?.id) {
                console.log('⏳ Waiting for Discord client to initialize...');
                return;
            }

            await rest.put(
                Routes.applicationCommands(this.client.application.id),

                { body: commands }
            );
            console.log('🎯 Slash commands registered successfully!');
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }
    }

    async handleSlashCommand(interaction) {
        const { commandName, options } = interaction;
        const channelType = options.getString('channel');

        try {
            switch (commandName) {
                case 'play':
                    if (this.currentPlaylists[channelType].songs.length === 0) {
                        await interaction.reply('❌ No songs loaded. Use `/load` first!');
                        return;
                    }

                    await this.joinVoiceChannel(channelType);
                    await this.playCurrentSong(channelType);
                    await interaction.reply(`▶️ Playing music in ${channelType} channel!`);
                    break;

                case 'pause':
                    this.pausePlayback(channelType);
                    await interaction.reply(`⏸️ Paused ${channelType} channel`);
                    break;

                case 'skip':
                    await this.skipSong(channelType);
                    const currentSong = this.currentPlaylists[channelType].songs[this.currentPlaylists[channelType].currentIndex];
                    await interaction.reply(`⏭️ Skipped to: **${currentSong?.title || 'Unknown'}**`);
                    break;

                case 'stop':
                    this.stopPlayback(channelType);
                    this.leaveVoiceChannel(channelType);
                    await interaction.reply(`⏹️ Stopped ${channelType} channel and left voice`);
                    break;

                case 'queue':
                    const queue = this.currentPlaylists[channelType];
                    if (queue.songs.length === 0) {
                        await interaction.reply(`No songs in ${channelType} queue`);
                    } else {
                        const queueList = queue.songs.slice(0, 10).map((song, index) => 
                            `${index === queue.currentIndex ? '▶️' : `${index + 1}.`} ${song.title}`
                        ).join('\n');
                        await interaction.reply(`🎵 **${channelType} Queue:**\n\`\`\`${queueList}\`\`\``);
                    }
                    break;

                case 'load':
                    const url = options.getString('url');
                    await interaction.deferReply();
                    
                    try {
                        // Auto-join voice channel when loading content
                        await this.joinVoiceChannel(channelType);
                        
                        let songs = [];
                        if (this.isPlaylistUrl(url)) {
                            songs = await this.getPlaylistSongs(url);
                        } else if (this.isYouTubeVideoUrl(url)) {
                            songs = await this.getSingleVideoData(url);
                        } else {
                            await interaction.editReply('❌ Invalid YouTube URL');
                            return;
                        }

                        this.currentPlaylists[channelType].songs = songs;
                        this.currentPlaylists[channelType].currentIndex = 0;

                        // Auto-start playing immediately after loading
                        try {
                            await this.playCurrentSong(channelType);
                            const message = songs.length === 1 ? 
                                `✅ Loaded song: **${songs[0].title}** and started playing! 🎵` : 
                                `✅ Loaded **${songs.length} songs** and started playing! 🎵`;
                            await interaction.editReply(message);
                        } catch (playError) {
                            const message = songs.length === 1 ? 
                                `✅ Loaded song: **${songs[0].title}** in ${channelType} channel\n🎵 Bot joined voice channel and ready to play!` : 
                                `✅ Loaded **${songs.length} songs** in ${channelType} channel\n🎵 Bot joined voice channel and ready to play!`;
                            await interaction.editReply(message);
                        }
                    } catch (error) {
                        await interaction.editReply(`❌ Failed to load content: ${error.message}`);
                    }
                    break;
            }
        } catch (error) {
            console.error('Command error:', error);
            if (!interaction.replied) {
                await interaction.reply('❌ An error occurred while processing your command.');
            }
        }
    }

    setupWebServer() {
        // Enhanced dashboard route
        this.app.get('/', (req, res) => {
            res.send(this.renderDashboard());
        });

        // Suno posting routes
        this.app.post('/post-song', async (req, res) => {
            try {
                const { url, description = '', hashtags = [] } = req.body;
                
                if (!url) {
                    return res.status(400).json({ error: 'URL is required' });
                }

                const songData = await this.extractSongData(url);
                await this.postToDiscord(songData.title, url, description, hashtags);
                
                res.json({ success: true, message: 'Song posted successfully!' });
            } catch (error) {
                console.error('Error posting song:', error);
                res.status(500).json({ error: 'Failed to post song' });
            }
        });

        // Load playlist or individual song
        this.app.post('/load-content', async (req, res) => {
            try {
                const { url, channelType } = req.body;
                
                if (!url || !channelType) {
                    return res.status(400).json({ error: 'URL and channel type are required' });
                }

                let songs = [];
                if (this.isPlaylistUrl(url)) {
                    songs = await this.getPlaylistSongs(url);
                } else if (this.isYouTubeVideoUrl(url)) {
                    songs = await this.getSingleVideoData(url);
                } else {
                    return res.status(400).json({ error: 'Invalid YouTube URL' });
                }

                this.currentPlaylists[channelType].songs = songs;
                this.currentPlaylists[channelType].currentIndex = 0;

                const message = songs.length === 1 ? 
                    `Loaded song: ${songs[0].title}` : 
                    `Loaded ${songs.length} songs for ${channelType} videos`;

                res.json({ 
                    success: true, 
                    message,
                    songs: songs.slice(0, 10)
                });
            } catch (error) {
                console.error('Error loading content:', error);
                res.status(500).json({ error: 'Failed to load content' });
            }
        });

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌟 Web server running on port ${PORT}`);
        });
    }

    isPlaylistUrl(url) {
        return url.includes('playlist?list=') || url.includes('&list=');
    }

    isYouTubeVideoUrl(url) {
        return url.includes('youtube.com/watch') || url.includes('youtu.be/');
    }

    async getSingleVideoData(url) {
        try {
            const videoId = this.extractVideoId(url);
            const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${this.config.youtube.apiKey}`;
            
            const response = await axios.get(videoUrl);
            const video = response.data.items[0];
            
            if (!video) {
                throw new Error('Video not found');
            }

            return [{
                id: videoId,
                title: video.snippet.title,
                url: `https://www.youtube.com/watch?v=${videoId}`
            }];
        } catch (error) {
            console.error('Error fetching single video:', error);
            throw new Error('Failed to fetch video data');
        }
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return match ? match[1] : null;
    }

    async getPlaylistSongs(playlistUrl) {
        try {
            const playlistId = this.extractPlaylistId(playlistUrl);
            const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${this.config.youtube.apiKey}`;
            
            const response = await axios.get(apiUrl);
            const items = response.data.items;
            
            const songs = items
                .filter(item => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
                .map(item => ({
                    id: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
                }))
                .filter(song => this.isMusicContent(song));

            console.log(`Filtered out ${items.length - songs.length} non-music videos from playlist`);
            return songs;
        } catch (error) {
            console.error('Error fetching playlist:', error);
            throw new Error('Failed to fetch playlist');
        }
    }

    isMusicContent(video) {
        const title = video.title.toLowerCase();
        const description = video.description?.toLowerCase() || '';
        
        const musicKeywords = [
            'music', 'song', 'audio', 'track', 'album', 'single', 'ep', 'mix', 'remix',
            'official', 'lyric', 'instrumental', 'acoustic', 'live', 'cover', 'version',
            'bass', 'beat', 'rap', 'hip hop', 'rock', 'pop', 'jazz', 'blues', 'classical',
            'electronic', 'dance', 'house', 'techno', 'dubstep', 'trap', 'reggae'
        ];
        
        const hasMusicKeywords = musicKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );

        const hasMusicPatterns = 
            /\b(ft\.?|feat\.?|featuring)\b/i.test(title) ||
            /\b\d{4}\b/.test(title) ||
            /\([^)]*\)/i.test(title) ||
            /\[[^\]]*\]/i.test(title) ||
            /-\s*(official|music|audio|lyric)/i.test(title);

        return hasMusicKeywords || hasMusicPatterns;
    }

    extractPlaylistId(url) {
        const match = url.match(/[?&]list=([^&]+)/);
        return match ? match[1] : null;
    }

    async joinVoiceChannel(channelType) {
        const channelId = channelType === 'music' ? 
            this.config.discord.musicVideoChannelId : 
            this.config.discord.lyricVideoChannelId;

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

        // Auto-skip to next song when current one ends
        player.on(AudioPlayerStatus.Idle, () => {
            console.log(`🎵 Song ended in ${channelType}, auto-skipping to next...`);
            this.skipSong(channelType);
        });

        player.on('error', error => {
            console.error(`Audio player error in ${channelType}:`, error);
            this.skipSong(channelType);
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log(`Voice connection lost for ${channelType} channel`);
        });
    }

    async playCurrentSong(channelType) {
        const playlist = this.currentPlaylists[channelType];
        
        if (playlist.songs.length === 0) {
            console.log(`No songs in ${channelType} playlist`);
            return;
        }

        // Ensure we have a valid index
        if (playlist.currentIndex >= playlist.songs.length) {
            playlist.currentIndex = 0;
            console.log(`🔄 Looping to song 1/${playlist.songs.length} in ${channelType} channel`);
        } else {
            console.log(`🔄 Looping to song ${playlist.currentIndex + 1}/${playlist.songs.length} in ${channelType} channel`);
        }

        const currentSong = playlist.songs[playlist.currentIndex];
        if (!currentSong) {
            console.log(`No current song found for ${channelType}`);
            return;
        }

        try {
            const stream = ytdl(currentSong.url, { 
                filter: 'audioonly',
                quality: 'lowestaudio',
                highWaterMark: 1 << 25
            });
            
            const resource = createAudioResource(stream);
            playlist.player.play(resource);
            playlist.isPlaying = true;
            
            console.log(`🎵 Playing: ${currentSong.title} in ${channelType} channel`);
        } catch (error) {
            console.error(`Error playing song in ${channelType}:`, error);
            this.skipSong(channelType);
        }
    }

    pausePlayback(channelType) {
        const playlist = this.currentPlaylists[channelType];
        if (playlist.player) {
            playlist.player.pause();
            playlist.isPlaying = false;
        }
    }

    async skipSong(channelType) {
        const playlist = this.currentPlaylists[channelType];
        
        playlist.currentIndex = (playlist.currentIndex + 1) % playlist.songs.length;
        
        if (playlist.connection && playlist.player) {
            await this.playCurrentSong(channelType);
        }
    }

    stopPlayback(channelType) {
        const playlist = this.currentPlaylists[channelType];
        if (playlist.player) {
            playlist.player.stop();
            playlist.isPlaying = false;
        }
    }

    leaveVoiceChannel(channelType) {
        const playlist = this.currentPlaylists[channelType];
        if (playlist.connection) {
            playlist.connection.destroy();
            playlist.connection = null;
            playlist.player = null;
            playlist.isPlaying = false;
        }
    }

    async extractSongData(url) {
        try {
            const response = await axios.get(url);
            const html = response.data;
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            const title = titleMatch ? titleMatch[1].trim() : 'Unknown Song';
            
            return {
                title: title.replace(' | Suno', '').trim(),
                url: url
            };
        } catch (error) {
            console.error('Error extracting song data:', error);
            return {
                title: 'Unknown Song',
                url: url
            };
        }
    }

    async postToDiscord(title, url, description = '', hashtags = []) {
        try {
            const channel = await this.client.channels.fetch(this.config.discord.targetChannelId);
            if (!channel) {
                throw new Error('Target Discord channel not found');
            }

            const embed = new EmbedBuilder()
                .setTitle('🎵 New Suno Song')
                .setDescription(`**${title}**\n\n${description}\n\n[Listen Here](${url})`)
                .setColor('#FF6B6B')
                .setTimestamp();

            const hashtagText = hashtags.length > 0 ? `\n\n${hashtags.map(tag => `#${tag}`).join(' ')}` : '';
            const message = `🎵 New Suno song: **${title}** — ${url}${hashtagText}`;

            await channel.send({ content: message, embeds: [embed] });
            console.log(`Posted song to Discord: ${title}`);
        } catch (error) {
            console.error('Error posting to Discord:', error);
            throw error;
        }
    }

    renderDashboard() {
        const currentMusicSong = this.currentPlaylists.music.songs[this.currentPlaylists.music.currentIndex];
        const currentLyricSong = this.currentPlaylists.lyric.songs[this.currentPlaylists.lyric.currentIndex];

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🎵 Enhanced Music Bot Dashboard</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                    color: #333;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    overflow: hidden;
                }

                .header {
                    background: linear-gradient(135deg, #FF6B6B, #4ECDC4);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }

                .header h1 {
                    font-size: 2.5rem;
                    margin-bottom: 10px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                }

                .content {
                    padding: 30px;
                }

                .section {
                    margin-bottom: 40px;
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.08);
                }

                .section h2 {
                    color: #2c3e50;
                    margin-bottom: 20px;
                    font-size: 1.8rem;
                    border-bottom: 3px solid #3498db;
                    padding-bottom: 10px;
                }

                .video-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
                    gap: 30px;
                    margin-bottom: 30px;
                }

                .video-container {
                    background: #2c3e50;
                    border-radius: 15px;
                    overflow: hidden;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                }

                .video-wrapper {
                    position: relative;
                    width: 100%;
                    height: 315px;
                    background: #34495e;
                }

                .video-wrapper iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    pointer-events: none;
                }

                .video-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 40px;
                    background: transparent;
                    z-index: 10;
                    pointer-events: all;
                    cursor: default;
                }

                .video-controls {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(transparent, rgba(0,0,0,0.8));
                    padding: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .btn-volume {
                    background: rgba(255,255,255,0.9);
                    color: #333;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .btn-volume:hover {
                    background: white;
                    transform: scale(1.05);
                }

                .video-info {
                    color: white;
                    font-size: 0.9rem;
                    opacity: 0.8;
                    margin-top: 4px;
                }

                .no-video {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 315px;
                    color: #7f8c8d;
                    text-align: center;
                }

                .placeholder {
                    font-size: 4rem;
                    margin-bottom: 15px;
                    opacity: 0.5;
                }

                .subtitle {
                    opacity: 0.6;
                    font-size: 0.9rem;
                }

                .form-group {
                    margin-bottom: 20px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: #2c3e50;
                }

                .form-group input, .form-group textarea, .form-group select {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s;
                }

                .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
                    outline: none;
                    border-color: #3498db;
                }

                .btn {
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    margin-right: 10px;
                }

                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(52, 152, 219, 0.4);
                }

                .btn-success {
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                }

                .btn-success:hover {
                    box-shadow: 0 5px 15px rgba(46, 204, 113, 0.4);
                }

                .status {
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-weight: 600;
                }

                .status.success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }

                .status.error {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                }

                @media (max-width: 768px) {
                    .video-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .header h1 {
                        font-size: 2rem;
                    }
                    
                    .content {
                        padding: 20px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎵 Enhanced Music Bot Dashboard</h1>
                    <p>Advanced Discord Music Bot with Live Video Streaming</p>
                </div>

                <div class="content">
                    <!-- Live Video Streams -->
                    <div class="section">
                        <h2>🎬 Live Video Streams</h2>
                        <div class="video-grid">
                            <!-- Music Videos Stream -->
                            <div class="video-container">
                                <h3 style="color: #374151; margin-bottom: 12px;">🎬 Music Videos</h3>
                                <div class="video-wrapper">
                                    ${currentMusicSong ? `
                                        <iframe 
                                            id="musicVideo"
                                            src="https://www.youtube.com/embed/${currentMusicSong.id}?autoplay=1&mute=1&controls=0&disablekb=1&rel=0&modestbranding=1&enablejsapi=0"
                                            frameborder="0" 
                                            allow="autoplay; encrypted-media"
                                            style="pointer-events: none;">
                                        </iframe>
                                        <div class="video-overlay"></div>
                                        <div class="video-controls">
                                            <button class="btn-volume" onclick="toggleMute('musicVideo')" id="musicMute">🔊 Unmute</button>
                                            <div class="video-info">
                                                <strong>${currentMusicSong.title}</strong>
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="no-video">
                                            <div class="placeholder">🎬</div>
                                            <p>No music video playing</p>
                                            <p class="subtitle">Load a playlist to see live video</p>
                                        </div>
                                    `}
                                </div>
                            </div>

                            <!-- Lyric Videos Stream -->
                            <div class="video-container">
                                <h3 style="color: #374151; margin-bottom: 12px;">🎤 Lyric Videos</h3>
                                <div class="video-wrapper">
                                    ${currentLyricSong ? `
                                        <iframe 
                                            id="lyricVideo"
                                            src="https://www.youtube.com/embed/${currentLyricSong.id}?autoplay=1&mute=1&controls=0&disablekb=1&rel=0&modestbranding=1&enablejsapi=0"
                                            frameborder="0" 
                                            allow="autoplay; encrypted-media"
                                            style="pointer-events: none;">
                                        </iframe>
                                        <div class="video-overlay"></div>
                                        <div class="video-controls">
                                            <button class="btn-volume" onclick="toggleMute('lyricVideo')" id="lyricMute">🔊 Unmute</button>
                                            <div class="video-info">
                                                <strong>${currentLyricSong.title}</strong>
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="no-video">
                                            <div class="placeholder">🎤</div>
                                            <p>No lyric video playing</p>
                                            <p class="subtitle">Load a playlist to see live video</p>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- YouTube Playlist Loading -->
                    <div class="section">
                        <h2>🎵 Load YouTube Content</h2>
                        <form id="loadContentForm">
                            <div class="grid">
                                <div class="form-group">
                                    <label for="playlistUrl">YouTube URL (Playlist or Single Video)</label>
                                    <input type="url" id="playlistUrl" name="playlistUrl" 
                                           placeholder="https://www.youtube.com/playlist?list=..." required>
                                </div>
                                <div class="form-group">
                                    <label for="channelType">Channel Type</label>
                                    <select id="channelType" name="channelType" required>
                                        <option value="">Select Channel Type</option>
                                        <option value="music">🎬 Music Videos</option>
                                        <option value="lyric">🎤 Lyric Videos</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-success">🎵 Load Content & Auto-Play</button>
                        </form>
                        <div id="loadStatus"></div>
                    </div>

                    <!-- Suno Song Posting -->
                    <div class="section">
                        <h2>🎵 Post Suno Song</h2>
                        <form id="songForm">
                            <div class="form-group">
                                <label for="songUrl">Suno Song URL</label>
                                <input type="url" id="songUrl" name="songUrl" 
                                       placeholder="https://suno.com/song/..." required>
                            </div>
                            <div class="form-group">
                                <label for="description">Description (Optional)</label>
                                <textarea id="description" name="description" rows="3" 
                                          placeholder="Add a description for your song..."></textarea>
                            </div>
                            <div class="form-group">
                                <label for="hashtags">Hashtags (Optional)</label>
                                <input type="text" id="hashtags" name="hashtags" 
                                       placeholder="music, newrelease, suno (comma separated)">
                            </div>
                            <button type="submit" class="btn">🎵 Post to Discord</button>
                        </form>
                        <div id="status"></div>
                    </div>

                    <!-- Current Playlists -->
                    <div class="section">
                        <h2>📋 Current Playlists</h2>
                        <div class="grid">
                            <div>
                                <h3>🎬 Music Videos (${this.currentPlaylists.music.songs.length} songs)</h3>
                                <p><strong>Currently Playing:</strong> ${currentMusicSong?.title || 'None'}</p>
                                <p><strong>Status:</strong> ${this.currentPlaylists.music.isPlaying ? '▶️ Playing' : '⏸️ Paused'}</p>
                            </div>
                            <div>
                                <h3>🎤 Lyric Videos (${this.currentPlaylists.lyric.songs.length} songs)</h3>
                                <p><strong>Currently Playing:</strong> ${currentLyricSong?.title || 'None'}</p>
                                <p><strong>Status:</strong> ${this.currentPlaylists.lyric.isPlaying ? '▶️ Playing' : '⏸️ Paused'}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Discord Commands Info -->
                    <div class="section">
                        <h2>🎮 Discord Commands</h2>
                        <div class="grid">
                            <div>
                                <h4>/load [url] [channel]</h4>
                                <p>Load YouTube playlist or video and auto-start playing</p>
                            </div>
                            <div>
                                <h4>/play [channel]</h4>
                                <p>Start playing music in selected channel</p>
                            </div>
                            <div>
                                <h4>/pause [channel]</h4>
                                <p>Pause music playback</p>
                            </div>
                            <div>
                                <h4>/skip [channel]</h4>
                                <p>Skip to next song</p>
                            </div>
                            <div>
                                <h4>/stop [channel]</h4>
                                <p>Stop music and leave voice channel</p>
                            </div>
                            <div>
                                <h4>/queue [channel]</h4>
                                <p>Show current playlist</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                // Video mute toggle functionality
                function toggleMute(videoId) {
                    const button = document.getElementById(videoId === 'musicVideo' ? 'musicMute' : 'lyricMute');
                    const iframe = document.getElementById(videoId);
                    
                    if (button.textContent.includes('Unmute')) {
                        // Unmute video by changing source to remove mute parameter
                        const currentSrc = iframe.src;
                        iframe.src = currentSrc.replace('&mute=1', '').replace('mute=1&', '').replace('mute=1', '');
                        button.textContent = '🔇 Mute';
                    } else {
                        // Mute video by adding mute parameter
                        const currentSrc = iframe.src;
                        iframe.src = currentSrc + (currentSrc.includes('?') ? '&' : '?') + 'mute=1';
                        button.textContent = '🔊 Unmute';
                    }
                }

                // Load content form submission
                document.getElementById('loadContentForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const formData = new FormData(e.target);
                    const data = {
                        url: formData.get('playlistUrl'),
                        channelType: formData.get('channelType')
                    };
                    
                    const statusDiv = document.getElementById('loadStatus');
                    statusDiv.innerHTML = '<div class="status">Loading content...</div>';
                    
                    try {
                        const response = await fetch('/load-content', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            statusDiv.innerHTML = '<div class="status success">✅ ' + result.message + '</div>';
                            setTimeout(() => location.reload(), 2000);
                        } else {
                            statusDiv.innerHTML = '<div class="status error">❌ ' + result.error + '</div>';
                        }
                    } catch (error) {
                        statusDiv.innerHTML = '<div class="status error">❌ Failed to load content</div>';
                    }
                });

                // Song posting form submission
                document.getElementById('songForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const formData = new FormData(e.target);
                    const hashtags = formData.get('hashtags').split(',').map(tag => tag.trim()).filter(tag => tag);
                    
                    const data = {
                        url: formData.get('songUrl'),
                        description: formData.get('description'),
                        hashtags: hashtags
                    };
                    
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = '<div class="status">Posting song...</div>';
                    
                    try {
                        const response = await fetch('/post-song', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            statusDiv.innerHTML = '<div class="status success">✅ Song posted successfully!</div>';
                            e.target.reset();
                        } else {
                            statusDiv.innerHTML = '<div class="status error">❌ ' + result.error + '</div>';
                        }
                    } catch (error) {
                        statusDiv.innerHTML = '<div class="status error">❌ Failed to post song</div>';
                    }
                });

                // Auto-refresh every 30 seconds to update currently playing
                setInterval(() => {
                    location.reload();
                }, 30000);
            </script>
        </body>
        </html>
        `;
    }
}

// Start the bot
const bot = new EnhancedMusicBot();
<<<<<<< HEAD
bot.start().catch(console.error);
=======
bot.start().catch(console.error);
>>>>>>> 419805a (Transform bot into enhanced music experience with new features)
