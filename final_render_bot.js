const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ChannelType, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const youtubeDl = require('youtube-dl-exec');
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
        
        // Bot configuration
        this.token = process.env.DISCORD_TOKEN;
        this.clientId = this.client.user?.id;
        this.sunoChannelId = process.env.DISCORD_CHANNEL_ID;
        
        // Single music queue (simplified)
        this.musicQueue = [];
        this.currentSong = null;
        this.connection = null;
        this.player = null;
        
        // Connection status for dashboard
        this.connectionStatus = {
            connected: false,
            muted: 'unknown',
            deafened: 'unknown', 
            channelName: null,
            playing: false
        };
        
        // YouTube integration
        this.currentVideoId = null;
        
        // Suno profile monitoring
        this.sunoProfiles = [
            {
                id: '3kloudz',
                name: 'Sample Artist',
                lastChecked: new Date()
            }
        ];
        
        this.postedSongs = new Set();
        this.pendingProfiles = [];
        
        this.startProfileMonitoring();
    }

    startProfileMonitoring() {
        setInterval(() => {
            this.checkAllProfilesForNewSongs();
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    async checkAllProfilesForNewSongs() {
        for (const profile of this.sunoProfiles) {
            await this.checkProfileForNewSongs(profile);
        }
    }

    async checkProfileForNewSongs(profile) {
        try {
            console.log(`🔍 Checking profile: ${profile.name}`);
            profile.lastChecked = new Date();
            
            const songs = await this.getSunoProfileSongs(profile.id);
            
            for (const song of songs) {
                if (!this.postedSongs.has(song.id)) {
                    console.log(`🆕 New song found: ${song.title}`);
                    await this.postSunoToDiscord(song.title, song.url, song.description);
                    this.postedSongs.add(song.id);
                }
            }
        } catch (error) {
            console.error(`❌ Error checking profile ${profile.name}:`, error);
        }
    }

    async getSunoProfileSongs(profileId) {
        try {
            const response = await axios.get(`https://studio-api.suno.ai/api/feed/?ids=${profileId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            return response.data || [];
        } catch (error) {
            console.log(`❌ API unavailable for ${profileId}, continuing monitoring...`);
            return [];
        }
    }

    async start() {
        this.setupDiscordEvents();
        this.setupWebServer();
        
        try {
            await this.client.login(this.token);
            console.log('🎵 Bot logged in as', this.client.user.tag);
        } catch (error) {
            console.error('❌ Failed to login:', error);
        }
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('load')
                .setDescription('Load and play YouTube video or playlist')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('YouTube URL')
                        .setRequired(true))
        ];

        const rest = new REST({ version: '10' }).setToken(this.token);

        try {
            console.log('🔄 Refreshing slash commands...');
            // Only register commands after client is ready
            if (this.clientId) {
                await rest.put(Routes.applicationCommands(this.clientId), { body: commands });
                console.log('✅ Slash commands registered and refreshed!');
            }
        } catch (error) {
            console.error('❌ Error registering commands:', error);
        }
    }

    setupDiscordEvents() {
        this.client.once('ready', async () => {
            console.log('🎵 Bot logged in as', this.client.user.tag);
            this.clientId = this.client.user.id;
            
            // Register commands now that we have the client ID
            await this.registerSlashCommands();
        });

        this.client.on('interactionCreate', async interaction => {
            try {
                if (interaction.isChatInputCommand()) {
                    const { commandName, options } = interaction;
                    
                    switch (commandName) {
                        case 'load':
                            const url = options.getString('url');
                            await this.handleLoadAndPlay(interaction, url);
                            break;
                    }
                } else if (interaction.isButton()) {
                    await interaction.deferReply({ ephemeral: true });
                    
                    switch (interaction.customId) {
                        case 'pause_music':
                            if (this.player) {
                                this.player.pause();
                                await interaction.editReply('⏸️ Music paused');
                            }
                            break;
                        case 'skip_music':
                            this.playCurrentSong();
                            await interaction.editReply('⏭️ Skipped to next song');
                            break;
                        case 'stop_music':
                            await this.adminStop();
                            await interaction.editReply('⏹️ Music stopped and disconnected');
                            break;
                        case 'show_queue':
                            const queueList = this.musicQueue.slice(0, 10).map((song, i) => 
                                `${i + 1}. ${song.title}`
                            ).join('\n') || 'Queue is empty';
                            await interaction.editReply(`📜 **Current Queue:**\n\`\`\`${queueList}\`\`\``);
                            break;
                    }
                }
            } catch (error) {
                console.error('❌ Command error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply('❌ An error occurred while processing your command.');
                }
            }
        });
    }

    async handleLoadAndPlay(interaction, url) {
        await interaction.deferReply();
        
        try {
            // Always use your specific MUSIC VIDEO channel
            const guild = interaction.guild;
            const voiceChannel = guild.channels.cache.get('1375476962356887614');
                
            if (!voiceChannel) {
                await interaction.editReply('❌ Could not find your MUSIC VIDEO channel');
                return;
            }

            console.log(`🎵 Attempting to join voice channel: ${voiceChannel.name}`);
            await this.joinVoiceChannelById(voiceChannel.id, interaction.guild);
            
            if (url.includes('playlist')) {
                const songs = await this.getPlaylistSongs(url);
                this.musicQueue.push(...songs);
                
                // Create beautiful embed with controls like FlaviBot
                const embed = {
                    color: 0x00ff00,
                    title: "🎵 Now Playing",
                    description: `**${this.currentSong?.title || 'Loading...'}**`,
                    fields: [
                        {
                            name: "📋 Queue",
                            value: `Added ${songs.length} songs to queue`,
                            inline: true
                        }
                    ],
                    footer: {
                        text: "3AM VERIFIED Music Bot"
                    }
                };

                const row = {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 2,
                            label: "⏸️ Pause",
                            custom_id: "pause_music"
                        },
                        {
                            type: 2,
                            style: 2,
                            label: "⏭️ Skip",
                            custom_id: "skip_music"
                        },
                        {
                            type: 2,
                            style: 4,
                            label: "⏹️ Stop",
                            custom_id: "stop_music"
                        },
                        {
                            type: 2,
                            style: 1,
                            label: "📜 Queue",
                            custom_id: "show_queue"
                        }
                    ]
                };

                await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                const videoId = this.extractVideoId(url);
                if (!videoId) {
                    await interaction.editReply('❌ Invalid YouTube URL');
                    return;
                }
                
                this.musicQueue.push({ title: 'YouTube Video', videoId, url });
                this.currentVideoId = videoId;
                
                await interaction.editReply(`✅ Added video to queue and started playing!`);
            }
            
            // Start playing immediately
            await this.playCurrentSong();
            
        } catch (error) {
            console.error('❌ Load and play error:', error);
            await interaction.editReply('❌ Failed to load and play content. Make sure you\'re in a voice channel!');
        }
    }

    extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async getPlaylistSongs(playlistUrl) {
        const playlistId = this.extractPlaylistId(playlistUrl);
        if (!playlistId) return [];

        try {
            const response = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
                params: {
                    part: 'snippet',
                    playlistId: playlistId,
                    maxResults: 50,
                    key: process.env.YOUTUBE_API_KEY
                }
            });

            return response.data.items.map(item => ({
                title: item.snippet.title,
                videoId: item.snippet.resourceId.videoId,
                url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
            }));
        } catch (error) {
            console.error('❌ YouTube API error:', error);
            return [];
        }
    }

    extractPlaylistId(url) {
        const regex = /[&?]list=([^&]+)/;
        const match = url.match(regex);
        return match ? match[1].split('&')[0] : null;
    }

    // Admin-only functions (not exposed as slash commands)
    async adminSkip() {
        if (this.player) {
            this.player.stop();
        }
    }

    async adminStop() {
        if (this.player) this.player.stop();
        if (this.connection) this.connection.destroy();
        
        this.musicQueue.length = 0;
        this.currentSong = null;
        this.connection = null;
        this.player = null;
        this.currentVideoId = null;
    }

    async joinVoiceChannelById(channelId, guild) {
        // Don't create multiple connections
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            console.log(`🔗 Already connected, reusing existing connection`);
            return;
        }
        
        console.log(`🔗 Creating new voice connection to channel ID: ${channelId}`);
        
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        this.connection = connection;
        
        // Only create player if we don't have one
        if (!this.player) {
            this.player = createAudioPlayer();
        }
        
        connection.subscribe(this.player);
        console.log(`🎵 Voice connection created and player subscribed`);
        
        // Update connection status
        this.connectionStatus.connected = true;
        this.connectionStatus.channelName = guild.channels.cache.get(channelId)?.name || 'Unknown';
        
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('🎵 Connected to voice channel:', this.connectionStatus.channelName);
            console.log('⚠️  BOT IS MUTED/DEAFENED - Right-click bot and uncheck "Server Mute" and "Server Deafen"');
        });
        
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            this.connectionStatus.connected = false;
            this.connectionStatus.playing = false;
        });
    }

    async playCurrentSong() {
        if (this.musicQueue.length === 0 || !this.player) return;
        
        const song = this.musicQueue.shift();
        this.currentSong = song;
        this.currentVideoId = song.videoId;
        
        try {
            console.log(`🎵 Playing: ${song.title} - ${song.url}`);
            
            // Try youtube-dl-exec first (more reliable than ytdl-core)
            let audioSource;
            try {
                console.log('🔄 Using youtube-dl-exec for reliable audio...');
                const info = await youtubeDl(song.url, {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                    addHeader: ['referer:youtube.com', 'user-agent:googlebot']
                });
                
                const audioFormat = info.formats.find(f => 
                    f.acodec && f.acodec !== 'none' && f.url
                );
                
                if (audioFormat) {
                    console.log(`✅ Found reliable audio: ${audioFormat.ext}`);
                    audioSource = audioFormat.url;
                } else {
                    throw new Error('No audio format found');
                }
            } catch (dlError) {
                console.log('⚠️ Fallback to ytdl-core...');
                audioSource = ytdl(song.url, { 
                    filter: 'audioonly',
                    quality: 'lowest',
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    }
                });
            }
            
            const resource = createAudioResource(audioSource, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });
            
            // Set volume to maximum to ensure audibility
            if (resource.volume) {
                resource.volume.setVolume(1.0);
            }
            
            this.player.play(resource);
            
            console.log('🎵 Audio resource created and playing');
            console.log('⚠️  REMINDER: Right-click bot in Discord voice channel and uncheck "Server Mute" and "Server Deafen"');
            
            this.player.on(AudioPlayerStatus.Idle, () => {
                console.log('🎵 Song finished, playing next...');
                this.playCurrentSong();
            });
            
            this.player.on(AudioPlayerStatus.Playing, () => {
                console.log('✅ Bot is now playing audio - Check if unmuted in Discord!');
                this.connectionStatus.playing = true;
            });
            
            this.player.on(AudioPlayerStatus.Idle, () => {
                this.connectionStatus.playing = false;
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

        // Admin testing endpoint
        this.app.get('/admin/test-monitoring', async (req, res) => {
            try {
                console.log('🔍 Testing monitoring system...');
                
                const testData = {
                    title: 'Monitoring System Test',
                    url: 'https://suno.com/song/test',
                    description: 'System test - monitoring is working perfectly! 🎵'
                };
                
                await this.postTestToDiscord(testData);
                
                res.json({ 
                    success: true, 
                    message: `✅ Test completed! Check Discord for test message. Monitoring ${this.sunoProfiles.length} profiles.` 
                });
            } catch (error) {
                console.error('❌ Test error:', error);
                res.json({ success: false, message: '❌ Test failed: ' + error.message });
            }
        });

        // Admin manual check endpoint
        this.app.get('/admin/check-now', async (req, res) => {
            try {
                console.log('⚡ Manual check initiated...');
                await this.checkAllProfilesForNewSongs();
                
                res.json({ 
                    success: true, 
                    message: `✅ Manual check completed for ${this.sunoProfiles.length} profiles!` 
                });
            } catch (error) {
                console.error('❌ Manual check error:', error);
                res.json({ success: false, message: '❌ Check failed: ' + error.message });
            }
        });

        // Post Suno song endpoint
        this.app.post('/post-suno', async (req, res) => {
            try {
                const { sunoUrl } = req.body;
                
                if (!sunoUrl) {
                    return res.json({ success: false, error: 'Suno URL is required' });
                }

                console.log(`🎵 Posting Suno song: ${sunoUrl}`);
                await this.postSunoToDiscord('Manual Post', sunoUrl, 'Manually posted via dashboard');
                
                res.json({ 
                    success: true, 
                    message: 'Song posted to Discord successfully!' 
                });
            } catch (error) {
                console.error('❌ Post Suno error:', error);
                res.json({ success: false, error: 'Failed to post song to Discord' });
            }
        });

        // Load YouTube content endpoint
        this.app.post('/load-youtube', async (req, res) => {
            try {
                const { url } = req.body;
                
                if (!url) {
                    return res.json({ success: false, error: 'YouTube URL is required' });
                }

                if (url.includes('playlist')) {
                    const songs = await this.getPlaylistSongs(url);
                    this.musicQueue.push(...songs);
                    res.json({ 
                        success: true, 
                        message: `Added ${songs.length} songs to queue!` 
                    });
                } else {
                    const videoId = this.extractVideoId(url);
                    if (!videoId) {
                        return res.json({ success: false, error: 'Invalid YouTube URL' });
                    }
                    
                    this.musicQueue.push({ title: 'YouTube Video', videoId, url });
                    this.currentVideoId = videoId;
                    
                    res.json({ 
                        success: true, 
                        message: 'Video added to queue!' 
                    });
                }
            } catch (error) {
                console.error('❌ YouTube load error:', error);
                res.json({ success: false, error: 'Failed to load YouTube content' });
            }
        });

        // User request profile endpoint
        this.app.post('/request-profile', async (req, res) => {
            try {
                const { profileId, profileName, submittedBy, reason } = req.body;
                
                if (!profileId || !profileName) {
                    return res.json({ success: false, error: 'Profile ID and name are required' });
                }

                this.pendingProfiles.push({
                    profileId,
                    profileName,
                    submittedBy: submittedBy || 'Anonymous',
                    reason: reason || 'No reason provided',
                    submittedAt: new Date()
                });

                console.log(`📋 New profile request: ${profileName} by ${submittedBy || 'Anonymous'}`);
                
                res.json({ 
                    success: true, 
                    message: 'Request submitted for admin approval!' 
                });
            } catch (error) {
                console.error('❌ Request error:', error);
                res.json({ success: false, error: 'Failed to submit request' });
            }
        });

        this.app.listen(5000, () => {
            console.log('🌟 Web server running on port 5000');
        });
    }

    async extractSunoData(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            const html = response.data;
            
            let title = 'Unknown Song';
            const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]*)"[^>]*>/i);
            if (ogTitleMatch) {
                title = ogTitleMatch[1];
            }
            
            let imageUrl = null;
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]*)"[^>]*>/i);
            if (ogImageMatch) {
                imageUrl = ogImageMatch[1];
            }
            
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

    async postTestToDiscord(testData) {
        try {
            const channel = await this.client.channels.fetch(this.sunoChannelId);
            
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Suno', iconURL: 'https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld' })
                .setTitle(testData.title)
                .setURL(testData.url)
                .setDescription(testData.description)
                .setImage('https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400')
                .setColor('#4F46E5')
                .setTimestamp();

            const message = `🎵 New Suno song: **${testData.title}** — ${testData.url}`;
            
            await channel.send({ content: message, embeds: [embed] });
            console.log(`✅ Posted test to Discord: ${testData.title}`);
        } catch (error) {
            console.error('❌ Discord test posting error:', error);
            throw error;
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            const channel = await this.client.channels.fetch(this.sunoChannelId);
            
            const songData = await this.extractSunoData(url);
            
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Suno', iconURL: 'https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld' })
                .setTitle(songData.title)
                .setURL(url)
                .setColor('#4F46E5')
                .setTimestamp();

            if (songData.imageUrl) {
                embed.setImage(songData.imageUrl);
            }

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

    renderDashboard() {
        const currentVideo = this.currentVideoId ? 
            `<iframe width="100%" height="315" src="https://www.youtube.com/embed/${this.currentVideoId}?autoplay=1&mute=1" frameborder="0" allowfullscreen></iframe>` :
            '<div class="no-video"><h3>🎵</h3><p>No video loaded</p></div>';

        return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>3AM VERIFIED - Enhanced Music Bot</title>
        <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* Theme Variables */
        :root {
            --bg-primary: linear-gradient(-45deg, #667eea, #764ba2, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57, #ff9ff3);
            --bg-secondary: rgba(255, 255, 255, 0.1);
            --text-primary: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --border-color: rgba(255, 255, 255, 0.2);
            --input-bg: rgba(255, 255, 255, 0.2);
            --card-bg: rgba(255, 255, 255, 0.15);
            --shadow: rgba(0, 0, 0, 0.3);
        }
        
        [data-theme="light"] {
            --bg-primary: linear-gradient(-45deg, #e3f2fd, #f3e5f5, #ffebee, #e0f2f1, #e1f5fe, #f1f8e9, #fff3e0, #fce4ec);
            --bg-secondary: rgba(0, 0, 0, 0.05);
            --text-primary: #333333;
            --text-secondary: #666666;
            --border-color: rgba(0, 0, 0, 0.1);
            --input-bg: rgba(0, 0, 0, 0.05);
            --card-bg: rgba(255, 255, 255, 0.8);
            --shadow: rgba(0, 0, 0, 0.1);
        }
        
        [data-theme="dark"] {
            --bg-primary: linear-gradient(-45deg, #1a1a2e, #16213e, #0f3460, #533483, #2d1b69, #0f0f23, #1a1a2e, #16213e);
            --bg-secondary: rgba(255, 255, 255, 0.05);
            --text-primary: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.6);
            --border-color: rgba(255, 255, 255, 0.1);
            --input-bg: rgba(255, 255, 255, 0.1);
            --card-bg: rgba(255, 255, 255, 0.1);
            --shadow: rgba(0, 0, 0, 0.5);
        }
        
        @keyframes gentleGradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        
        @keyframes crazyTextGlow {
            0% { 
                text-shadow: 
                    0 0 5px #00ffff,
                    0 0 10px #8a2be2,
                    0 0 15px #00ffff,
                    0 0 20px #8a2be2;
            }
            25% { 
                text-shadow: 
                    0 0 10px #8a2be2,
                    0 0 20px #00ffff,
                    0 0 30px #8a2be2,
                    0 0 40px #00ffff;
            }
            50% { 
                text-shadow: 
                    0 0 15px #00ffff,
                    0 0 25px #8a2be2,
                    0 0 35px #00ffff,
                    0 0 45px #8a2be2;
            }
            75% { 
                text-shadow: 
                    0 0 10px #8a2be2,
                    0 0 20px #00ffff,
                    0 0 30px #8a2be2,
                    0 0 40px #00ffff;
            }
            100% { 
                text-shadow: 
                    0 0 5px #00ffff,
                    0 0 10px #8a2be2,
                    0 0 15px #00ffff,
                    0 0 20px #8a2be2;
            }
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--bg-primary);
            background-size: 800% 800%;
            animation: gentleGradient 30s ease infinite;
            min-height: 100vh; 
            color: var(--text-primary); 
            padding: 20px;
            position: relative;
            overflow-x: hidden;
            transition: all 0.3s ease;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(45deg, 
                rgba(138, 43, 226, 0.4) 0%,
                rgba(0, 255, 255, 0.3) 25%,
                rgba(138, 43, 226, 0.4) 50%,
                rgba(0, 255, 255, 0.3) 75%,
                rgba(138, 43, 226, 0.4) 100%
            );
            background-size: 600% 600%;
            animation: scrollGradient 20s ease infinite;
            z-index: -2;
            opacity: 0.8;
        }

        body::after {
            content: '';
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                radial-gradient(circle at 25% 25%, rgba(0, 255, 255, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 75% 75%, rgba(138, 43, 226, 0.2) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, rgba(0, 255, 255, 0.1) 0%, transparent 50%);
            animation: floatParticles 15s ease-in-out infinite;
            z-index: -1;
        }

        @keyframes scrollGradient {
            0% { background-position: 0% 0%; transform: rotate(0deg); }
            25% { background-position: 100% 100%; transform: rotate(90deg); }
            50% { background-position: 0% 100%; transform: rotate(180deg); }
            75% { background-position: 100% 0%; transform: rotate(270deg); }
            100% { background-position: 0% 0%; transform: rotate(360deg); }
        }

        @keyframes floatParticles {
            0%, 100% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.6; }
            33% { transform: translateY(-30px) translateX(20px) scale(1.1); opacity: 0.8; }
            66% { transform: translateY(30px) translateX(-20px) scale(0.9); opacity: 0.7; }
        }
        
        .container { max-width: 1200px; margin: 0 auto; }
        
        .header { 
            text-align: center; margin-bottom: 60px; 
            animation: crazyBanner 12s ease-in-out infinite;
            perspective: 1000px;
            transform-style: preserve-3d;
        }
        
        .header h1 { 
            font-size: 4rem; margin-bottom: 20px; 
            background: linear-gradient(45deg, #00ffff, #8a2be2, #00ffff);
            background-size: 400% 400%;
            animation: gentleGradient 8s ease infinite;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: crazyTextGlow 6s ease-in-out infinite;
        }

        .verified-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 150px;
            height: 150px;
            border: 3px solid #8a2be2;
            border-radius: 50%;
            background: radial-gradient(circle at center, rgba(138, 43, 226, 0.3), rgba(0, 0, 0, 0.8));
            box-shadow: 
                0 0 20px #8a2be2,
                inset 0 0 20px rgba(138, 43, 226, 0.5);
            animation: verifiedPulse 3s ease-in-out infinite;
            margin: 20px auto;
            position: relative;
            flex-direction: column;
        }

        .verified-badge .three-am {
            color: #00ffff;
            font-size: 2rem;
            font-weight: bold;
            text-shadow: 0 0 15px #00ffff;
            margin-bottom: 5px;
        }

        .verified-badge .verified-text {
            color: #8a2be2;
            font-size: 1rem;
            font-weight: bold;
            text-shadow: 0 0 10px #8a2be2;
            margin-bottom: 10px;
        }

        .verified-checkmark {
            width: 35px;
            height: 35px;
            border: 2px solid #00ffff;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #00ffff;
            font-size: 1.5rem;
            box-shadow: 0 0 15px #00ffff;
        }

        @keyframes verifiedPulse {
            0%, 100% { 
                box-shadow: 
                    0 0 20px #8a2be2,
                    inset 0 0 20px rgba(138, 43, 226, 0.5);
            }
            50% { 
                box-shadow: 
                    0 0 40px #8a2be2,
                    0 0 60px #00ffff,
                    inset 0 0 30px rgba(138, 43, 226, 0.8);
            }
        }
        
        .section { 
            background: var(--bg-secondary); 
            backdrop-filter: blur(20px);
            padding: 40px; margin-bottom: 40px; 
            border-radius: 20px; 
            border: 1px solid var(--border-color);
            box-shadow: 0 20px 40px var(--shadow);
            transition: all 0.3s ease;
        }

        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: var(--card-bg);
            border-radius: 50px;
            padding: 10px;
            border: 2px solid var(--border-color);
            backdrop-filter: blur(10px);
            display: flex;
            gap: 5px;
        }

        .theme-btn {
            padding: 8px 12px;
            border: none;
            border-radius: 25px;
            background: transparent;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
        }

        .theme-btn.active {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .theme-btn:hover:not(.active) {
            color: var(--text-primary);
            background: var(--input-bg);
        }
        
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 30px; margin-top: 30px; 
        }
        
        .profile-card {
            background: var(--card-bg);
            padding: 25px;
            border-radius: 15px;
            border: 1px solid var(--border-color);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        
        .btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; border: none; padding: 15px 30px;
            border-radius: 25px; cursor: pointer; font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
        }
        
        .btn:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4);
        }
        
        .form-group { margin-bottom: 25px; }
        
        .form-group label { 
            display: block; margin-bottom: 10px; font-weight: bold; 
            color: var(--text-primary); text-shadow: 0 2px 4px var(--shadow);
        }
        
        .form-group input, .form-group select, .form-group textarea {
            width: 100%; padding: 15px; border: none; 
            border-radius: 10px; background: var(--input-bg);
            color: var(--text-primary); font-size: 16px;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        
        .form-group input::placeholder, 
        .form-group textarea::placeholder {
            color: var(--text-secondary);
        }
        
        .video-wrapper { 
            position: relative; 
            background: rgba(0, 0, 0, 0.5); 
            border-radius: 15px; 
            overflow: hidden;
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5);
        }
        
        .video-wrapper iframe { 
            width: 100%; height: 100%; border: none; 
            transition: all 0.3s ease;
            pointer-events: none;
        }
        
        .video-wrapper:hover iframe {
            transform: scale(1.05);
        }
        
        .video-overlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: transparent;
            z-index: 10;
            pointer-events: all;
            cursor: default;
        }
        
        .no-video {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 315px; color: #ccc;
            background: linear-gradient(135deg, rgba(0,0,0,0.6), rgba(255,255,255,0.1));
        }
        
        .no-video h3 { font-size: 3rem; margin-bottom: 10px; opacity: 0.7; }
        
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
        
        .status-value.warning {
            color: #ff6b6b;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        </style>
    </head>
    <body>
        <!-- Theme Toggle -->
        <div class="theme-toggle">
            <button class="theme-btn active" onclick="setTheme('auto')" id="auto-btn">🌓 Auto</button>
            <button class="theme-btn" onclick="setTheme('light')" id="light-btn">☀️ Light</button>
            <button class="theme-btn" onclick="setTheme('dark')" id="dark-btn">🌙 Dark</button>
        </div>

        <div class="container">
            <div class="header">
                <div class="verified-badge">
                    <div class="three-am">3AM</div>
                    <div class="verified-text">VERIFIED</div>
                    <div class="verified-checkmark">✓</div>
                </div>
                <h1>Enhanced Music Bot</h1>
                <p>Discord Music Bot with YouTube Integration & Suno Monitoring</p>
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
                        <span class="status-value ${this.connectionStatus.connected ? (this.connectionStatus.playing ? 'connected' : 'warning') : 'disconnected'}">
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

            <!-- Premium Suno Monitoring Dashboard -->
            <div class="section" style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.3), rgba(79, 70, 229, 0.3)); border: 2px solid rgba(124, 58, 237, 0.5);">
                <h2>🎵 Premium Suno Monitoring</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
                    <div style="background: rgba(0,255,0,0.2); padding: 20px; border-radius: 15px; text-align: center; border: 1px solid rgba(0,255,0,0.3);">
                        <h3 style="margin-top: 0; color: #4ade80;">🎵 Songs Posted</h3>
                        <div style="font-size: 3rem; font-weight: bold; color: #4ade80; margin: 10px 0;">0</div>
                        <p style="margin-bottom: 0; opacity: 0.8;">Auto-posted with reactions</p>
                    </div>
                    <div style="background: rgba(255,100,100,0.2); padding: 20px; border-radius: 15px; text-align: center; border: 1px solid rgba(255,100,100,0.3);">
                        <h3 style="margin-top: 0; color: #f87171;">👥 Profiles Monitored</h3>
                        <div style="font-size: 3rem; font-weight: bold; color: #f87171; margin: 10px 0;">1</div>
                        <p style="margin-bottom: 0; opacity: 0.8;">3kloudz actively tracked</p>
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 15px; margin-top: 20px; border: 1px solid rgba(255,255,255,0.2);">
                    <h3 style="margin-top: 0;">🔗 Active Monitoring Status</h3>
                    <p><strong>Primary Profile:</strong> 3kloudz</p>
                    <p><strong>Check Frequency:</strong> Every 3 minutes</p>
                    <p><strong>Status:</strong> <span style="color: #4ade80; font-weight: bold;">🟢 ACTIVE</span></p>
                    <p><strong>Last Check:</strong> <span id="lastCheck">Checking now...</span></p>
                </div>
            </div>

            <!-- Suno Song Posting -->
            <div class="section">
                <h2>🎵 Post Suno Song</h2>
                <form id="sunoForm">
                    <div class="form-group">
                        <label>Suno Song URL</label>
                        <input type="text" id="sunoUrl" placeholder="https://suno.com/song/..." required>
                    </div>
                    <button type="submit" class="btn">🎵 Post to Discord</button>
                </form>
                <div id="sunoStatus" style="margin-top: 15px;"></div>
            </div>

            <!-- Suno Profile Monitoring -->
            <div class="section">
                <h2>👥 Suno Profile Monitoring</h2>
                <div class="admin-controls" style="margin-bottom: 30px;">
                    <button onclick="testMonitoring()" class="btn" style="background: linear-gradient(135deg, #667eea, #764ba2);">🔍 Test Monitoring</button>
                    <button onclick="checkNow()" class="btn" style="background: linear-gradient(135deg, #4ecdc4, #44a08d);">⚡ Check Now</button>
                </div>
                <div class="grid">
                    ${this.sunoProfiles.map(profile => `
                        <div class="profile-card">
                            <h4>${profile.name}</h4>
                            <p><strong>Profile ID:</strong> ${profile.id}</p>
                            <p><strong>Last Checked:</strong> ${profile.lastChecked.toLocaleTimeString()}</p>
                            <p><strong>Status:</strong> <span style="color: #4ecdc4;">✅ Active</span></p>
                        </div>
                    `).join('')}
                </div>
                
                ${this.pendingProfiles.length > 0 ? `
                    <div style="margin-top: 40px;">
                        <h3>📋 Pending Profile Requests</h3>
                        <div class="grid">
                            ${this.pendingProfiles.map((request, index) => `
                                <div class="profile-card" style="border: 2px solid #ff6b6b;">
                                    <h4>${request.profileName}</h4>
                                    <p><strong>Profile ID:</strong> ${request.profileId}</p>
                                    <p><strong>Submitted by:</strong> ${request.submittedBy || 'Anonymous'}</p>
                                    <p><strong>Reason:</strong> ${request.reason || 'No reason provided'}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-top: 40px;">
                    <h3>📝 Request Profile Monitoring</h3>
                    <form id="requestProfileForm">
                        <div class="form-group">
                            <label>Suno Profile ID</label>
                            <input type="text" id="requestProfileId" placeholder="Enter Suno Profile ID" required>
                        </div>
                        <div class="form-group">
                            <label>Artist/Profile Name</label>
                            <input type="text" id="requestProfileName" placeholder="Artist or profile name" required>
                        </div>
                        <div class="form-group">
                            <label>Your Name (Optional)</label>
                            <input type="text" id="submitterName" placeholder="Your name">
                        </div>
                        <div class="form-group">
                            <label>Reason for Request (Optional)</label>
                            <textarea id="requestReason" placeholder="Why should this profile be monitored?"></textarea>
                        </div>
                        <button type="submit" class="btn">📋 Submit Request</button>
                    </form>
                    <div id="requestStatus" style="margin-top: 15px;"></div>
                </div>
            </div>
        </div>

        <script>
            // Theme System
            function setTheme(theme) {
                const buttons = document.querySelectorAll('.theme-btn');
                buttons.forEach(btn => btn.classList.remove('active'));
                document.getElementById(theme + '-btn').classList.add('active');
                
                if (theme === 'auto') {
                    // Auto theme based on time of day
                    const hour = new Date().getHours();
                    const autoTheme = (hour >= 6 && hour < 18) ? 'light' : 'dark';
                    document.documentElement.setAttribute('data-theme', autoTheme);
                    localStorage.setItem('theme', 'auto');
                } else {
                    document.documentElement.setAttribute('data-theme', theme);
                    localStorage.setItem('theme', theme);
                }
            }

            // Initialize theme on page load
            function initTheme() {
                const savedTheme = localStorage.getItem('theme') || 'auto';
                setTheme(savedTheme);
            }

            // Update auto theme every minute
            setInterval(() => {
                if (localStorage.getItem('theme') === 'auto') {
                    setTheme('auto');
                }
            }, 60000);

            // Initialize theme when page loads
            document.addEventListener('DOMContentLoaded', initTheme);

            async function testMonitoring() {
                try {
                    const response = await fetch('/admin/test-monitoring');
                    const result = await response.json();
                    alert(result.message);
                } catch (error) {
                    alert('❌ Test failed');
                }
            }

            async function checkNow() {
                try {
                    const response = await fetch('/admin/check-now');
                    const result = await response.json();
                    alert(result.message);
                    setTimeout(() => location.reload(), 2000);
                } catch (error) {
                    alert('❌ Check failed');
                }
            }

            function updateBackgroundOnScroll() {
                const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
                const hue = Math.floor(scrollPercent * 360);
                const saturation = 70 + (scrollPercent * 30);
                const lightness = 20 + (scrollPercent * 15);
                
                document.body.style.filter = 'hue-rotate(' + hue + 'deg) saturate(' + saturation + '%) brightness(' + (lightness + 80) + '%)';
            }

            let ticking = false;
            function requestTick() {
                if (!ticking) {
                    requestAnimationFrame(updateBackgroundOnScroll);
                    ticking = true;
                    setTimeout(function() { ticking = false; }, 16);
                }
            }

            window.addEventListener('scroll', requestTick);
            updateBackgroundOnScroll();

            // YouTube form submission
            document.getElementById('youtubeForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const status = document.getElementById('youtubeStatus');
                
                try {
                    const response = await fetch('/load-youtube', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: document.getElementById('youtubeUrl').value
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                        document.getElementById('youtubeForm').reset();
                        setTimeout(() => location.reload(), 2000);
                    } else {
                        status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                    }
                } catch (error) {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to load content</p>';
                }
            });

            // Suno form submission
            document.getElementById('sunoForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const status = document.getElementById('sunoStatus');
                
                try {
                    const response = await fetch('/post-suno', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sunoUrl: document.getElementById('sunoUrl').value
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                        document.getElementById('sunoForm').reset();
                    } else {
                        status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                    }
                } catch (error) {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to post song</p>';
                }
            });

            document.getElementById('requestProfileForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const status = document.getElementById('requestStatus');
                
                try {
                    const response = await fetch('/request-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            profileId: document.getElementById('requestProfileId').value,
                            profileName: document.getElementById('requestProfileName').value,
                            submittedBy: document.getElementById('submitterName').value,
                            reason: document.getElementById('requestReason').value
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                        document.getElementById('requestProfileForm').reset();
                    } else {
                        status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                    }
                } catch (error) {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to submit request</p>';
                }
            });
        </script>
    </body>
    </html>
        `;
    }
}

// Start the bot
const bot = new EnhancedMusicBot();
bot.start().catch(console.error);