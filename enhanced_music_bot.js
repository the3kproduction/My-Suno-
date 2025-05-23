const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
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

class EnhancedMusicBot {
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
            logger.info('🎵 Enhanced Music Bot logged in successfully');
            
            this.setupEventHandlers();
            this.setupWebServer();
            
            this.isReady = true;
            logger.info('🚀 Enhanced Music Bot ready!');
        } catch (error) {
            logger.error('Failed to start bot', error);
        }
    }

    setupEventHandlers() {
        this.client.on('ready', async () => {
            logger.info(`🎵 Bot logged in as ${this.client.user.tag}`);
            await this.registerSlashCommands();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleSlashCommand(interaction);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error', error);
        });
    }

    async registerSlashCommands() {
        const commands = [
            {
                name: 'play',
                description: 'Play music in voice channel',
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
                description: 'Pause current playback',
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
                description: 'Stop playback',
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
                name: 'join',
                description: 'Join voice channel',
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
                name: 'leave',
                description: 'Leave voice channel',
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
                name: 'nowplaying',
                description: 'Show currently playing song',
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
                description: 'Show current playlist queue',
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
            },
            {
                name: 'clear',
                description: 'Clear playlist (Admin only)',
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
                name: 'shuffle',
                description: 'Shuffle the playlist for variety',
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
            }
        ];

        try {
            await this.client.application.commands.set(commands);
            logger.info('🎯 Slash commands registered successfully!');
        } catch (error) {
            logger.error('Failed to register slash commands', error);
        }
    }

    async handleSlashCommand(interaction) {
        const { commandName, options } = interaction;
        const channelType = options.getString('channel');

        try {
            switch (commandName) {
                case 'play':
                    await this.playCurrentSong(channelType);
                    await interaction.reply(`▶️ Playing in ${channelType} channel!`);
                    break;

                case 'pause':
                    this.pausePlayback(channelType);
                    await interaction.reply(`⏸️ Paused ${channelType} channel`);
                    break;

                case 'skip':
                    await this.skipSong(channelType);
                    const playlist = this.currentPlaylists[channelType];
                    const currentSong = playlist.songs[playlist.currentIndex];
                    await interaction.reply(`⏭️ Skipped! Now playing: ${currentSong?.title || 'Unknown'}`);
                    break;

                case 'stop':
                    this.stopPlayback(channelType);
                    await interaction.reply(`⏹️ Stopped ${channelType} playback`);
                    break;

                case 'join':
                    await this.joinVoiceChannel(channelType);
                    await interaction.reply(`🎵 Joined ${channelType} voice channel!`);
                    break;

                case 'leave':
                    this.leaveVoiceChannel(channelType);
                    await interaction.reply(`👋 Left ${channelType} voice channel`);
                    break;

                case 'nowplaying':
                    const current = this.currentPlaylists[channelType];
                    const nowPlaying = current.songs[current.currentIndex];
                    if (nowPlaying) {
                        await interaction.reply(`🎵 **Now Playing:** ${nowPlaying.title}\n${nowPlaying.url}`);
                    } else {
                        await interaction.reply(`No song currently playing in ${channelType} channel`);
                    }
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

                case 'clear':
                    // Admin-only command - replace 'YOUR_DISCORD_USER_ID' with your actual Discord user ID
                    const adminUserId = 'YOUR_DISCORD_USER_ID'; // You'll need to provide your Discord user ID
                    
                    if (interaction.user.id !== adminUserId) {
                        await interaction.reply('❌ This command is admin-only!');
                        return;
                    }

                    this.currentPlaylists[channelType].songs = [];
                    this.currentPlaylists[channelType].currentIndex = 0;
                    
                    // Stop current playback if any
                    this.stopPlayback(channelType);
                    
                    await interaction.reply(`✅ Cleared ${channelType} playlist`);
                    break;

                case 'shuffle':
                    const shufflePlaylist = this.currentPlaylists[channelType];
                    if (shufflePlaylist.songs.length === 0) {
                        await interaction.reply(`❌ No songs to shuffle in ${channelType} channel`);
                        return;
                    }

                    // Shuffle the playlist using Fisher-Yates algorithm
                    for (let i = shufflePlaylist.songs.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shufflePlaylist.songs[i], shufflePlaylist.songs[j]] = [shufflePlaylist.songs[j], shufflePlaylist.songs[i]];
                    }

                    shufflePlaylist.currentIndex = 0; // Reset to beginning of shuffled playlist
                    await interaction.reply(`🔀 Shuffled ${shufflePlaylist.songs.length} songs in ${channelType} channel! 24/7 loop continues with new order.`);
                    break;
            }
        } catch (error) {
            logger.error('Slash command error', error);
            await interaction.reply(`❌ Error: ${error.message}`);
        }
    }

    setupWebServer() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Main dashboard
        this.app.get('/', (req, res) => {
            res.send(this.renderDashboard());
        });

        // Post song endpoint
        this.app.post('/post-song', async (req, res) => {
            try {
                const { url, title, description, useAI } = req.body;
                
                if (!url || !title) {
                    return res.status(400).json({ error: 'URL and title are required' });
                }

                let finalDescription = description || '';
                
                if (useAI) {
                    finalDescription = await this.generateEnhancedDescription(title, url);
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
                logger.error('Error loading content', error);
                res.status(500).json({ error: 'Failed to load content' });
            }
        });

        // Voice channel controls
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
        });
    }

    isPlaylistUrl(url) {
        return url.includes('list=');
    }

    isYouTubeVideoUrl(url) {
        return url.includes('youtube.com/watch') || url.includes('youtu.be/');
    }

    async getSingleVideoData(url) {
        try {
            const videoId = this.extractVideoId(url);
            const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                params: {
                    part: 'snippet',
                    id: videoId,
                    key: config.youtube.apiKey
                }
            });

            if (response.data.items.length === 0) {
                throw new Error('Video not found');
            }

            const video = response.data.items[0];
            const videoData = {
                id: video.id,
                title: video.snippet.title,
                url: `https://www.youtube.com/watch?v=${video.id}`,
                thumbnail: video.snippet.thumbnails.default.url,
                description: video.snippet.description || ''
            };

            // Check if content is music-related
            if (!this.isMusicContent(videoData)) {
                throw new Error('This content doesn\'t appear to be music-related. Only music content is allowed.');
            }

            return [videoData];
        } catch (error) {
            logger.error('Failed to fetch video data', error);
            throw error;
        }
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return match ? match[1] : null;
    }

    async getPlaylistSongs(playlistUrl) {
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

            const allSongs = response.data.items.map(item => ({
                id: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
                thumbnail: item.snippet.thumbnails.default.url,
                description: item.snippet.description || ''
            }));

            // Filter out non-music content
            const musicSongs = allSongs.filter(song => this.isMusicContent(song));
            
            if (musicSongs.length === 0) {
                throw new Error('No music content found in this playlist. Only music content is allowed.');
            }

            if (musicSongs.length < allSongs.length) {
                logger.info(`Filtered out ${allSongs.length - musicSongs.length} non-music videos from playlist`);
            }

            return musicSongs;
        } catch (error) {
            logger.error('Failed to fetch playlist', error);
            throw error;
        }
    }

    isMusicContent(video) {
        const title = video.title.toLowerCase();
        const description = video.description.toLowerCase();
        
        // Music-related keywords
        const musicKeywords = [
            'song', 'music', 'audio', 'track', 'album', 'single', 'ep', 'remix', 'cover',
            'acoustic', 'live', 'official', 'video', 'lyric', 'lyrics', 'instrumental',
            'beat', 'melody', 'tune', 'sound', 'artist', 'band', 'singer', 'vocal',
            'guitar', 'piano', 'drum', 'bass', 'synth', 'electronic', 'rock', 'pop',
            'hip hop', 'rap', 'jazz', 'classical', 'country', 'folk', 'blues', 'metal',
            'indie', 'alternative', 'dance', 'edm', 'techno', 'house', 'dubstep',
            'ambient', 'chill', 'lofi', 'lo-fi', 'soundtrack', 'theme', 'score'
        ];

        // Non-music content keywords (things to filter out)
        const nonMusicKeywords = [
            'tutorial', 'how to', 'review', 'unboxing', 'gameplay', 'gaming', 'let\'s play',
            'vlog', 'podcast', 'interview', 'news', 'documentary', 'trailer', 'movie',
            'tv show', 'series', 'episode', 'cooking', 'recipe', 'workout', 'fitness',
            'comedy', 'sketch', 'prank', 'reaction', 'compilation', 'fail', 'funny',
            'educational', 'lecture', 'presentation', 'tech', 'technology', 'science',
            'politics', 'sports', 'football', 'basketball', 'soccer', 'baseball'
        ];

        // Check for non-music keywords first (these take priority)
        const hasNonMusicKeywords = nonMusicKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );

        if (hasNonMusicKeywords) {
            return false;
        }

        // Check for music keywords
        const hasMusicKeywords = musicKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );

        // Additional checks for music-like patterns
        const hasMusicPatterns = 
            /\b(ft\.?|feat\.?|featuring)\b/i.test(title) || // featuring artists
            /\b\d{4}\b/.test(title) || // years (common in music)
            /\([^)]*\)/i.test(title) || // parentheses (common in music titles)
            /\[[^\]]*\]/i.test(title) || // brackets (common in music titles)
            /-\s*(official|music|audio|lyric)/i.test(title); // common music video patterns

        return hasMusicKeywords || hasMusicPatterns;
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
            // Simple and reliable streaming method
            const stream = ytdl(currentSong.url, { 
                filter: 'audioonly',
                quality: 'lowestaudio'
            });
            
            // Create audio resource from stream
            const resource = createAudioResource(stream);
            
            // Remove old listeners to prevent memory leaks
            playlist.player.removeAllListeners(AudioPlayerStatus.Idle);
            playlist.player.removeAllListeners('error');

            // Auto-skip when song ends - single listener only
            playlist.player.once(AudioPlayerStatus.Idle, () => {
                logger.info(`🎵 Song ended in ${channelType}, auto-skipping to next...`);
                setTimeout(() => this.skipSong(channelType), 2000);
            });

            // Error handling - single listener only
            playlist.player.once('error', (error) => {
                logger.error(`Audio player error in ${channelType}:`, error);
                setTimeout(() => this.skipSong(channelType), 3000);
            });
            
            playlist.player.play(resource);
            
            logger.info(`🎵 Playing: ${currentSong.title} in ${channelType} channel`);
        } catch (error) {
            logger.error('Failed to play song', error);
            // Auto-skip to next song if this one fails
            setTimeout(() => this.skipSong(channelType), 2000);
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
        if (playlist.songs.length === 0) return;
        
        // Loop back to beginning when reaching the end (24/7 endless loop)
        playlist.currentIndex = (playlist.currentIndex + 1) % playlist.songs.length;
        
        logger.info(`🔄 Looping to song ${playlist.currentIndex + 1}/${playlist.songs.length} in ${channelType} channel`);
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

    async generateEnhancedDescription(title, url) {
        // Create rich descriptions without AI
        const genres = ['electronic', 'pop', 'rock', 'hip-hop', 'ambient', 'synthwave', 'indie', 'experimental'];
        const moods = ['dreamy', 'energetic', 'melancholic', 'uplifting', 'mysterious', 'nostalgic', 'powerful', 'ethereal'];
        const instruments = ['synths', 'guitar', 'piano', 'drums', 'bass', 'vocals', 'strings', 'brass'];
        
        const randomGenre = genres[Math.floor(Math.random() * genres.length)];
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        const randomInstrument = instruments[Math.floor(Math.random() * instruments.length)];
        
        const descriptions = [
            `A ${randomMood} ${randomGenre} track featuring beautiful ${randomInstrument} that creates an immersive listening experience.`,
            `This ${randomGenre} composition blends ${randomMood} melodies with rich ${randomInstrument} arrangements.`,
            `An atmospheric ${randomGenre} piece that captures a ${randomMood} essence through masterful ${randomInstrument} work.`,
            `Experience this ${randomMood} ${randomGenre} journey enhanced by stunning ${randomInstrument} production.`,
            `A captivating ${randomGenre} creation that delivers ${randomMood} vibes through innovative ${randomInstrument} design.`
        ];
        
        return descriptions[Math.floor(Math.random() * descriptions.length)];
    }

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
        const musicPlaylist = this.currentPlaylists.music || { songs: [], currentIndex: 0 };
        const lyricPlaylist = this.currentPlaylists.lyric || { songs: [], currentIndex: 0 };
        
        const currentMusicSong = musicPlaylist.songs.length > 0 ? musicPlaylist.songs[musicPlaylist.currentIndex] : null;
        const currentLyricSong = lyricPlaylist.songs.length > 0 ? lyricPlaylist.songs[lyricPlaylist.currentIndex] : null;
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Enhanced Music Bot</title>
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
        
        input, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input:focus, textarea:focus {
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
        
        .btn-enhanced {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
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
        
        .help-text {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
        }

        .video-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .video-container {
            background: #f9fafb;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #e5e7eb;
        }

        .video-wrapper {
            position: relative;
            background: #000;
            border-radius: 8px;
            overflow: hidden;
        }

        .video-wrapper iframe {
            width: 100%;
            height: 200px;
            border: none;
        }

        .no-video {
            height: 200px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
        }

        .no-video .placeholder {
            font-size: 3rem;
            margin-bottom: 12px;
            opacity: 0.7;
        }

        .no-video .subtitle {
            font-size: 0.9rem;
            opacity: 0.8;
            margin-top: 4px;
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
        
        .video-wrapper iframe {
            pointer-events: none;
        }

        .video-info {
            color: white;
            font-size: 0.9rem;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }

            .video-grid {
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
            <h1>🎵 Enhanced Music Bot</h1>
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
                    <textarea id="description" name="description" rows="3" placeholder="Add a custom description"></textarea>
                </div>
                
                <div class="button-group">
                    <button type="button" class="btn-primary" onclick="extractSong()">🎯 Auto-Extract</button>
                    <button type="submit" class="btn-primary">🚀 Post Song</button>
                    <button type="submit" class="btn-enhanced" onclick="submitWithEnhanced(event)">✨ Enhanced Post</button>
                </div>
            </form>
        </div>
        
        <!-- Live Video Streams -->
        <div class="card full-width">
            <h2 style="margin-bottom: 20px; color: #374151;">📺 Live Video Streams</h2>
            <div class="video-grid">
                <!-- Music Videos Stream -->
                <div class="video-container">
                    <h3 style="color: #374151; margin-bottom: 12px;">🎬 Music Videos</h3>
                    <div class="video-wrapper">
                        ${currentMusicSong ? `
                            <iframe 
                                id="musicVideo"
                                src="https://www.youtube.com/embed/${currentMusicSong.id}?autoplay=1&mute=1&controls=0&disablekb=1&rel=0&modestbranding=1&enablejsapi=0&origin=${req.get('host')}"
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
                                src="https://www.youtube.com/embed/${currentLyricSong.id}?autoplay=1&mute=1&controls=0&disablekb=1&rel=0&modestbranding=1&enablejsapi=0&origin=${req.get('host')}"
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

        <!-- YouTube Content -->
        <div class="grid">
            <!-- Music Videos -->
            <div class="card">
                <h3 style="color: #374151; margin-bottom: 16px;">🎬 Music Videos</h3>
                
                <div class="form-group">
                    <label for="musicContent">YouTube URL</label>
                    <input type="url" id="musicContent" placeholder="Playlist or single video URL">
                    <div class="help-text">Supports both playlists and individual videos</div>
                </div>
                
                <button class="btn-music" onclick="loadContent('music')">📥 Load Content</button>
                
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
                    <label for="lyricContent">YouTube URL</label>
                    <input type="url" id="lyricContent" placeholder="Playlist or single video URL">
                    <div class="help-text">Supports both playlists and individual videos</div>
                </div>
                
                <button class="btn-lyric" onclick="loadContent('lyric')">📥 Load Content</button>
                
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
        
        function submitWithEnhanced(event) {
            event.preventDefault();
            document.querySelector('input[name="useAI"]')?.remove();
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'useAI';
            input.value = 'true';
            document.getElementById('songForm').appendChild(input);
            document.getElementById('songForm').dispatchEvent(new Event('submit'));
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

        // Video control functions
        function toggleMute(videoId) {
            const iframe = document.getElementById(videoId);
            const button = document.getElementById(videoId === 'musicVideo' ? 'musicMute' : 'lyricMute');
            
            if (!iframe) return;
            
            const currentSrc = iframe.src;
            if (currentSrc.includes('mute=1')) {
                // Unmute the video
                iframe.src = currentSrc.replace('mute=1', 'mute=0');
                button.textContent = '🔇 Mute';
                button.style.background = 'rgba(255,107,107,0.9)';
            } else {
                // Mute the video
                iframe.src = currentSrc.replace('mute=0', 'mute=1');
                button.textContent = '🔊 Unmute';
                button.style.background = 'rgba(255,255,255,0.9)';
            }
        }

        // Auto-refresh video streams to sync with current playing song
        setInterval(() => {
            window.location.reload();
        }, 15000); // Refresh every 15 seconds to sync videos
        
        async function loadContent(channelType) {
            const inputId = channelType === 'music' ? 'musicContent' : 'lyricContent';
            const url = document.getElementById(inputId).value;
            
            if (!url) {
                showMessage('Please enter a YouTube URL', 'error');
                return;
            }
            
            showLoading(true);
            try {
                const response = await fetch('/load-content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, channelType })
                });
                
                const result = await response.json();
                if (result.success) {
                    showMessage(result.message, 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showMessage(result.error || 'Failed to load content', 'error');
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
const bot = new EnhancedMusicBot();
bot.start().catch(error => {
    logger.error('Failed to start bot', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down bot...');
    process.exit(0);
});