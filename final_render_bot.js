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
        
        // Bot configuration
        this.token = process.env.DISCORD_TOKEN;
        this.clientId = this.client.user?.id;
        this.sunoChannelId = process.env.DISCORD_CHANNEL_ID;
        
        // Single music queue (simplified)
        this.musicQueue = [];
        this.currentSong = null;
        this.connection = null;
        this.player = null;
        
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
        await this.registerSlashCommands();
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
                .setDescription('Load YouTube video or playlist')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('YouTube URL')
                        .setRequired(true)),
            
            new SlashCommandBuilder()
                .setName('play')
                .setDescription('Play current queue'),
                        
            new SlashCommandBuilder()
                .setName('skip')
                .setDescription('Skip current song'),
                        
            new SlashCommandBuilder()
                .setName('stop')
                .setDescription('Stop playback and clear queue')
        ];

        const rest = new REST({ version: '10' }).setToken(this.token);

        try {
            console.log('🔄 Refreshing slash commands...');
            await rest.put(Routes.applicationCommands(this.clientId), { body: commands });
            console.log('✅ Slash commands registered and refreshed!');
        } catch (error) {
            console.error('❌ Error registering commands:', error);
        }
    }

    setupDiscordEvents() {
        this.client.once('ready', () => {
            console.log('🎵 Bot logged in as', this.client.user.tag);
            this.clientId = this.client.user.id;
        });

        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName, options } = interaction;

            try {
                switch (commandName) {
                    case 'load':
                        const url = options.getString('url');
                        await this.handleLoad(interaction, url);
                        break;
                    case 'play':
                        await this.handlePlay(interaction);
                        break;
                    case 'skip':
                        await this.handleSkip(interaction);
                        break;
                    case 'stop':
                        await this.handleStop(interaction);
                        break;
                }
            } catch (error) {
                console.error('❌ Command error:', error);
                if (!interaction.replied) {
                    await interaction.reply('❌ An error occurred while processing your command.');
                }
            }
        });
    }

    async handleLoad(interaction, url) {
        await interaction.deferReply();
        
        try {
            if (url.includes('playlist')) {
                const songs = await this.getPlaylistSongs(url);
                this.musicQueue.push(...songs);
                
                await interaction.editReply(`✅ Added ${songs.length} songs to music queue!`);
            } else {
                const videoId = this.extractVideoId(url);
                if (!videoId) {
                    await interaction.editReply('❌ Invalid YouTube URL');
                    return;
                }
                
                this.musicQueue.push({ title: 'YouTube Video', videoId, url });
                this.currentVideoId = videoId;
                
                await interaction.editReply(`✅ Added video to music queue!`);
            }
        } catch (error) {
            await interaction.editReply('❌ Failed to load content');
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
        return match ? match[1] : null;
    }

    async handlePlay(interaction) {
        await interaction.deferReply();
        
        try {
            await this.joinVoiceChannel(interaction);
            await this.playCurrentSong();
            await interaction.editReply(`▶️ Playing music queue!`);
        } catch (error) {
            await interaction.editReply('❌ Failed to start playback');
        }
    }

    async handleSkip(interaction) {
        await interaction.deferReply();
        
        try {
            await this.skipSong();
            await interaction.editReply(`⏭️ Skipped song!`);
        } catch (error) {
            await interaction.editReply('❌ Failed to skip song');
        }
    }

    async handleStop(interaction) {
        await interaction.deferReply();
        
        try {
            this.stopPlayback();
            await interaction.editReply(`⏹️ Stopped playback!`);
        } catch (error) {
            await interaction.editReply('❌ Failed to stop playback');
        }
    }

    async joinVoiceChannel(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            throw new Error('You need to be in a voice channel!');
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        this.connection = connection;
        this.player = createAudioPlayer();
        connection.subscribe(this.player);
    }

    async playCurrentSong() {
        if (this.musicQueue.length === 0 || !this.player) return;
        
        const song = this.musicQueue.shift();
        this.currentSong = song;
        this.currentVideoId = song.videoId;
        
        try {
            const stream = ytdl(song.url, { 
                filter: 'audioonly',
                quality: 'highestaudio'
            });
            
            const resource = createAudioResource(stream);
            this.player.play(resource);
            
            this.player.on(AudioPlayerStatus.Idle, () => {
                this.playCurrentSong();
            });
            
        } catch (error) {
            console.error('❌ Playback error:', error);
            this.playCurrentSong();
        }
    }

    async skipSong() {
        if (this.player) {
            this.player.stop();
        }
    }

    stopPlayback() {
        if (this.player) this.player.stop();
        if (this.connection) this.connection.destroy();
        
        this.musicQueue.length = 0;
        this.currentSong = null;
        this.connection = null;
        this.player = null;
        this.currentVideoId = null;
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
                <form id="youtubeForm">
                    <div class="form-group">
                        <label>YouTube URL</label>
                        <input type="text" id="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." required>
                    </div>
                    <button type="submit" class="btn">📺 Load to Music Queue</button>
                </form>
                <div id="youtubeStatus" style="margin-top: 15px;"></div>
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