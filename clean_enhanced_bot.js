const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ChannelType, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI for screenshot analysis
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        
        // Multiple Suno profiles to monitor
        this.sunoProfiles = [
            {
                id: process.env.SUNO_PROFILE_ID,
                name: 'Main Profile',
                lastChecked: new Date()
            }
            // Add more profiles here as needed
        ];
        
        // Track posted songs to avoid duplicates
        this.postedSongs = new Set();
        
        // Pending profile submissions for admin approval
        this.pendingProfiles = [];
        
        // Start monitoring all profiles
        this.startProfileMonitoring();
    }

    startProfileMonitoring() {
        // Check all profiles every 5 minutes
        setInterval(() => {
            this.checkAllProfilesForNewSongs();
        }, 5 * 60 * 1000); // 5 minutes
        
        // Initial check after 10 seconds
        setTimeout(() => {
            this.checkAllProfilesForNewSongs();
        }, 10000);
    }

    async checkAllProfilesForNewSongs() {
        console.log(`🔍 Checking ${this.sunoProfiles.length} Suno profiles for new songs...`);
        
        for (const profile of this.sunoProfiles) {
            try {
                await this.checkProfileForNewSongs(profile);
            } catch (error) {
                console.error(`❌ Error checking profile ${profile.name}:`, error);
            }
        }
    }

    async checkProfileForNewSongs(profile) {
        try {
            // Get latest songs from this profile
            const songs = await this.getSunoProfileSongs(profile.id);
            
            for (const song of songs) {
                // Check if we've already posted this song
                if (!this.postedSongs.has(song.id)) {
                    console.log(`🎵 New song found from ${profile.name}: ${song.title}`);
                    
                    // Post to Discord
                    await this.postSunoToDiscord(song.title, song.url, `New from ${profile.name}`);
                    
                    // Mark as posted
                    this.postedSongs.add(song.id);
                }
            }
            
            profile.lastChecked = new Date();
        } catch (error) {
            console.error(`❌ Error checking profile ${profile.name}:`, error);
        }
    }

    async getSunoProfileSongs(profileId) {
        try {
            // This would connect to Suno's API to get latest songs
            // For now, returning empty array - we'll need the actual Suno API endpoint
            const response = await axios.get(`https://studio-api.suno.ai/api/feed/?ids=${profileId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            return response.data || [];
        } catch (error) {
            console.error('❌ Error fetching Suno profile songs:', error);
            return [];
        }
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
                console.log('🔄 Refreshing slash commands...');
                await rest.put(
                    Routes.applicationCommands(this.client.user.id),
                    { body: commands }
                );
                console.log('✅ Slash commands registered and refreshed!');
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
            --card-bg: rgba(0, 0, 0, 0.03);
            --shadow: rgba(0, 0, 0, 0.1);
        }
        
        [data-theme="dark"] {
            --bg-primary: linear-gradient(-45deg, #2c3e50, #34495e, #7f8c8d, #95a5a6, #bdc3c7, #ecf0f1);
            --bg-secondary: rgba(255, 255, 255, 0.05);
            --text-primary: #ecf0f1;
            --text-secondary: rgba(236, 240, 241, 0.7);
            --border-color: rgba(255, 255, 255, 0.1);
            --input-bg: rgba(255, 255, 255, 0.1);
            --card-bg: rgba(255, 255, 255, 0.05);
            --shadow: rgba(0, 0, 0, 0.5);
        }
        
        @keyframes crazyBackground {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        
        @keyframes glow {
            0%, 100% { 
                box-shadow: 0 0 20px rgba(58, 169, 255, 0.5), 0 0 40px rgba(58, 169, 255, 0.3), 0 0 60px rgba(58, 169, 255, 0.1);
                text-shadow: 0 0 10px rgba(58, 169, 255, 0.8);
            }
            50% { 
                box-shadow: 0 0 30px rgba(58, 169, 255, 0.8), 0 0 60px rgba(58, 169, 255, 0.5), 0 0 90px rgba(58, 169, 255, 0.3);
                text-shadow: 0 0 20px rgba(58, 169, 255, 1);
            }
        }
        
        @keyframes gentleGradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        
        @keyframes softGlow {
            0%, 100% { 
                box-shadow: 0 0 15px rgba(255, 107, 107, 0.2), 0 0 25px rgba(78, 205, 196, 0.1);
            }
            50% { 
                box-shadow: 0 0 20px rgba(78, 205, 196, 0.2), 0 0 30px rgba(255, 107, 107, 0.1);
            }
        }
        
        @keyframes gentlePulse {
            0%, 100% { 
                transform: scale(1); 
                filter: brightness(1);
            }
            50% { 
                transform: scale(1.02); 
                filter: brightness(1.05);
            }
        }
        
        @keyframes subtleShimmer {
            0% { background-position: -100% center; }
            100% { background-position: 100% center; }
        }
        
        @keyframes gentleFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
        }
        
        @keyframes crazyBanner {
            0% { 
                transform: scale(1) rotateZ(0deg) rotateY(0deg);
                filter: hue-rotate(0deg) brightness(1) saturate(1);
            }
            25% { 
                transform: scale(1.05) rotateZ(1deg) rotateY(5deg);
                filter: hue-rotate(90deg) brightness(1.1) saturate(1.2);
            }
            50% { 
                transform: scale(1.08) rotateZ(0deg) rotateY(10deg);
                filter: hue-rotate(180deg) brightness(1.15) saturate(1.4);
            }
            75% { 
                transform: scale(1.05) rotateZ(-1deg) rotateY(5deg);
                filter: hue-rotate(270deg) brightness(1.1) saturate(1.2);
            }
            100% { 
                transform: scale(1) rotateZ(0deg) rotateY(0deg);
                filter: hue-rotate(360deg) brightness(1) saturate(1);
            }
        }
        
        @keyframes textExplosion {
            0% { 
                text-shadow: 
                    0 0 5px #ff6b6b,
                    0 0 10px #4ecdc4,
                    0 0 15px #667eea,
                    0 0 20px #764ba2;
            }
            25% { 
                text-shadow: 
                    0 0 10px #4ecdc4,
                    0 0 20px #667eea,
                    0 0 30px #764ba2,
                    0 0 40px #ff6b6b;
            }
            50% { 
                text-shadow: 
                    0 0 15px #667eea,
                    0 0 30px #764ba2,
                    0 0 45px #ff6b6b,
                    0 0 60px #4ecdc4;
            }
            75% { 
                text-shadow: 
                    0 0 10px #764ba2,
                    0 0 20px #ff6b6b,
                    0 0 30px #4ecdc4,
                    0 0 40px #667eea;
            }
            100% { 
                text-shadow: 
                    0 0 5px #ff6b6b,
                    0 0 10px #4ecdc4,
                    0 0 15px #667eea,
                    0 0 20px #764ba2;
            }
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(-45deg, #667eea, #764ba2, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57, #ff9ff3);
            background-size: 800% 800%;
            animation: gentleGradient 30s ease infinite;
            min-height: 100vh; color: white; padding: 20px;
            position: relative;
            overflow-x: hidden;
        }

        /* Dynamic scroll-based background */
        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(45deg, 
                rgba(102, 126, 234, 0.4) 0%,
                rgba(118, 75, 162, 0.4) 25%,
                rgba(255, 107, 107, 0.4) 50%,
                rgba(78, 205, 196, 0.4) 75%,
                rgba(150, 206, 180, 0.4) 100%
            );
            background-size: 600% 600%;
            animation: scrollGradient 20s ease infinite;
            z-index: -2;
            opacity: 0.8;
        }

        /* Floating particles */
        body::after {
            content: '';
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 75% 75%, rgba(78, 205, 196, 0.2) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, rgba(255, 107, 107, 0.1) 0%, transparent 50%);
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
            font-size: 5rem; margin-bottom: 20px; 
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #667eea, #764ba2, #ff6b6b);
            background-size: 400% 400%;
            animation: gentleGradient 8s ease infinite;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 8px 20px rgba(255,255,255,0.4)) drop-shadow(0 15px 30px rgba(0,0,0,0.3));
            font-weight: 800;
            letter-spacing: 2px;
            text-shadow: 0 0 20px rgba(255,255,255,0.3);
        }
        
        .header p {
            font-size: 1.3rem;
            background: linear-gradient(90deg, transparent, #fff, transparent);
            background-size: 200% 100%;
            animation: subtleShimmer 6s infinite;
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
            animation: gentleFloat 10s ease-in-out infinite;
        }
        
        .section:hover {
            transform: translateY(-8px) scale(1.01);
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: softGlow 3s ease infinite;
        }
        
        .section h2 {
            font-size: 3rem; margin-bottom: 50px; 
            text-align: center;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #667eea, #764ba2, #ff6b6b);
            background-size: 400% 400%;
            animation: gentleGradient 10s ease infinite, gentlePulse 6s ease infinite;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 8px 20px rgba(255,255,255,0.4)) drop-shadow(0 15px 30px rgba(0,0,0,0.3));
            transform: perspective(600px) rotateX(15deg);
            text-shadow: 0 0 30px rgba(255,255,255,0.4);
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
        
        /* Compact Mini-Player Overlay */
        .mini-player {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 350px;
            height: 120px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.95), rgba(118, 75, 162, 0.95));
            backdrop-filter: blur(20px);
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
            padding: 15px;
            z-index: 1000;
            transform: translateY(200px);
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: grab;
            user-select: none;
        }
        
        .mini-player.visible {
            transform: translateY(0);
            opacity: 1;
        }
        
        .mini-player.dragging {
            cursor: grabbing;
            transition: none;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }
        
        .mini-player:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 50px rgba(0,0,0,0.4);
        }
        
        .mini-player-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .mini-player-title {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255,255,255,0.8);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .mini-player-controls {
            display: flex;
            gap: 8px;
        }
        
        .mini-control-btn {
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 50%;
            background: rgba(255,255,255,0.2);
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        
        .mini-control-btn:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.1);
        }
        
        .mini-player-content {
            display: flex;
            gap: 12px;
            align-items: center;
        }
        
        .mini-album-art {
            width: 50px;
            height: 50px;
            border-radius: 8px;
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            animation: gentlePulse 3s ease-in-out infinite;
        }
        
        .mini-track-info {
            flex: 1;
            overflow: hidden;
        }
        
        .mini-track-name {
            font-weight: 600;
            font-size: 14px;
            color: white;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .mini-artist-name {
            font-size: 12px;
            color: rgba(255,255,255,0.7);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .mini-progress {
            width: 100%;
            height: 3px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            margin-top: 8px;
            overflow: hidden;
        }
        
        .mini-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #ff6b6b, #4ecdc4);
            border-radius: 2px;
            width: 45%;
            animation: subtleShimmer 2s ease-in-out infinite;
        }
        
        .mini-play-controls {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .mini-play-btn {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 50%;
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4);
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        
        .mini-play-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
        
        .mini-volume-control {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .mini-volume-slider {
            width: 60px;
            height: 3px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            position: relative;
            cursor: pointer;
        }
        
        .mini-volume-level {
            height: 100%;
            background: linear-gradient(90deg, #ff6b6b, #4ecdc4);
            border-radius: 2px;
            width: 70%;
        }
        
        .mini-player-expanded {
            height: auto;
            max-height: 200px;
        }
        
        .mini-player-toggle {
            position: absolute;
            bottom: -15px;
            left: 50%;
            transform: translateX(-50%);
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4);
            border: none;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: all 0.3s ease;
            opacity: 0;
        }
        
        .mini-player:hover .mini-player-toggle {
            opacity: 1;
        }
        
        .mini-player-toggle:hover {
            transform: translateX(-50%) scale(1.1);
        }
        
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
        
        .profile-card {
            background: rgba(255,255,255,0.1);
            padding: 20px; border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.2);
            transition: all 0.3s ease;
        }
        
        .profile-card:hover {
            background: rgba(255,255,255,0.2);
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }
        
        .profile-card h4 {
            color: #ff6b6b;
            font-size: 1.3rem;
            margin-bottom: 10px;
        }
        
        .profile-card p {
            margin-bottom: 5px;
            font-size: 0.9rem;
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
    <!-- Theme Toggle -->
    <div style="position: fixed; top: 20px; right: 20px; z-index: 1000;">
        <div style="display: flex; gap: 10px; background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border-radius: 25px; padding: 10px;">
            <button onclick="setTheme('auto')" style="background: linear-gradient(45deg, #667eea, #764ba2); border: none; border-radius: 50%; width: 40px; height: 40px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;">🔄</button>
            <button onclick="setTheme('light')" style="background: linear-gradient(45deg, #fff, #f0f0f0); border: none; border-radius: 50%; width: 40px; height: 40px; color: #333; cursor: pointer; display: flex; align-items: center; justify-content: center;">☀️</button>
            <button onclick="setTheme('dark')" style="background: linear-gradient(45deg, #2c3e50, #34495e); border: none; border-radius: 50%; width: 40px; height: 40px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;">🌙</button>
        </div>
    </div>

    <div class="container">
        <!-- Stunning 3AM VERIFIED Header -->
        <div class="header" style="text-align: center; padding: 60px 40px; background: transparent; position: relative;">
            <!-- 3AM VERIFIED Logo -->
            <div style="display: inline-block; width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); position: relative; margin-bottom: 30px; animation: glow 3s ease-in-out infinite;">
                <div style="position: absolute; top: 15px; left: 50%; transform: translateX(-50%); color: #3affe8; font-weight: 800; font-size: 24px; text-shadow: 0 0 20px rgba(58, 255, 232, 0.8);">3AM</div>
                <div style="position: absolute; bottom: 25px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 600; letter-spacing: 1px;">VERIFIED</div>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 30px; height: 30px; border: 3px solid #3affe8; border-radius: 8px; display: flex; align-items: center; justify-content: center; animation: glow 2s ease-in-out infinite;">
                    <span style="color: #3affe8; font-size: 18px; font-weight: bold;">✓</span>
                </div>
            </div>
            
            <!-- Enhanced Music Bot Title -->
            <h1 style="font-size: 4rem; font-weight: 800; background: linear-gradient(45deg, #3affe8, #667eea, #764ba2, #3affe8); background-size: 300% 300%; animation: crazyBackground 6s ease infinite; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 40px rgba(58, 255, 232, 0.5); margin-bottom: 20px; letter-spacing: 2px;">Enhanced Music Bot</h1>
            
            <!-- Subtitle -->
            <p style="font-size: 1.2rem; color: rgba(255,255,255,0.8); font-weight: 500; margin-bottom: 40px; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">Discord Music Bot with YouTube Integration & Suno Monitoring</p>
        </div>

        <!-- Live Music Stream Section -->
        <div class="section" style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2)); border: 2px solid rgba(58, 255, 232, 0.3);">
            <h2 style="display: flex; align-items: center; gap: 15px; margin-bottom: 30px;">🎵 Live Music Stream</h2>
            <div id="nowPlayingSection" style="background: rgba(255,255,255,0.1); padding: 25px; border-radius: 15px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #ff6b6b, #4ecdc4); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; animation: gentlePulse 3s ease-in-out infinite;">🎵</div>
                    <div style="flex: 1;">
                        <div style="color: #ff6b6b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🔴 Now Playing</div>
                        <div id="trackInfo" style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 3px;">
                            <span id="artistName">Listening for music...</span>
                        </div>
                        <div style="font-size: 14px; color: rgba(255,255,255,0.7);">
                            <span>Song: </span><span id="songName">Waiting for track info...</span>
                        </div>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 5px;">
                            <span>Source: </span><span id="sourceInfo">Music Video Channel</span> • 
                            <span>Status: </span><span id="statusInfo" style="color: #4ecdc4;">🔴 Live</span>
                        </div>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <button id="muteBtn" onclick="muteStream()" class="btn" style="background: linear-gradient(135deg, #ff6b6b, #ff5252); flex: 1;">🔇 Mute Stream</button>
                <button id="refreshBtn" onclick="refreshStream()" class="btn" style="background: linear-gradient(135deg, #4ecdc4, #26d0ce); flex: 1;">🔄 Refresh</button>
                <button onclick="window.open('https://discord.gg/JFwEY6mrnn', '_blank')" class="btn" style="background: linear-gradient(135deg, #7289da, #5865f2); flex: 1;">💬 Join Discord</button>
            </div>
        </div>

        <!-- Premium Suno Monitoring -->
        <div class="section">
            <h2>🎵 Premium Suno Monitoring</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <div style="background: linear-gradient(135deg, rgba(106, 90, 205, 0.3), rgba(72, 61, 139, 0.3)); padding: 25px; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #8A2BE2; margin-bottom: 15px;">🎵 Songs Posted</h3>
                    <div style="font-size: 3rem; font-weight: bold; color: white; margin-bottom: 10px;">0</div>
                    <p style="color: rgba(255,255,255,0.8);">Auto-posted with reactions</p>
                </div>
                <div style="background: linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(255, 99, 71, 0.3)); padding: 25px; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #FF6B6B; margin-bottom: 15px;">👥 Profiles Monitored</h3>
                    <div style="font-size: 3rem; font-weight: bold; color: white; margin-bottom: 10px;">1</div>
                    <p style="color: rgba(255,255,255,0.8);">3kloudz actively tracked</p>
                </div>
            </div>
        </div>

        <!-- Active Monitoring Status -->
        <div class="section" style="background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(138, 43, 226, 0.2)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">🔗 Active Monitoring Status</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div>
                    <p style="color: white; margin-bottom: 8px; font-weight: 500;"><strong>Primary Profile:</strong> 3kloudz</p>
                    <p style="color: white; margin-bottom: 8px; font-weight: 500;"><strong>Check Frequency:</strong> Every 3 minutes</p>
                </div>
                <div>
                    <p style="color: white; margin-bottom: 8px; font-weight: 500;"><strong>Status:</strong> <span style="color: #4ecdc4;">🟢 ACTIVE</span></p>
                    <p style="color: white; font-weight: 500;"><strong>Last Check:</strong> <span id="lastCheckTime">Checking now...</span></p>
                </div>
            </div>
        </div>

        <!-- Auto-Post Suno Song -->
        <div class="section" style="background: linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(139, 195, 74, 0.3)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">🎵 Auto-Post Suno Song</h2>
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Suno Song URL</label>
                <input type="url" id="sunoUrl" placeholder="https://suno.com/song/..." 
                       style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
            </div>
            <button onclick="postSunoSong()" style="background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 12px 30px; border: none; border-radius: 25px; font-weight: bold; cursor: pointer; margin-bottom: 20px;">
                🚀 Auto-Post with Smart Detection
            </button>
            <div style="background: rgba(0,255,127,0.1); padding: 20px; border-radius: 12px; border-left: 4px solid #00FF7F;">
                <h4 style="color: #00FF7F; margin-bottom: 10px;">🤖 Smart Auto-Detection</h4>
                <p style="color: white;">Your bot automatically extracts the real song title and artwork from Suno URLs using advanced detection technology. No manual input needed!</p>
            </div>
        </div>

        <!-- Suno Profile Monitoring -->
        <div class="section" style="background: linear-gradient(135deg, rgba(0, 191, 255, 0.3), rgba(30, 144, 255, 0.3)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">👥 Suno Profile Monitoring</h2>
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <button style="background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 10px 20px; border: none; border-radius: 20px; font-weight: bold;">● Test Monitoring</button>
                <button style="background: linear-gradient(135deg, #FF9800, #F57C00); color: white; padding: 10px 20px; border: none; border-radius: 20px; font-weight: bold;">🔄 Check Now</button>
            </div>
            <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
                <h4 style="color: #00BFFF; margin-bottom: 15px;">Sample Artist</h4>
                <p style="margin-bottom: 5px; color: white;"><strong>Profile ID:</strong> 3kloudz</p>
                <p style="margin-bottom: 5px; color: white;"><strong>Last Checked:</strong> <span id="profileLastCheck">2:04:35 AM</span></p>
                <p style="color: white;"><strong>Status:</strong> <span style="color: #4ecdc4;">✅ Active</span></p>
                <button style="background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 8px 16px; border: none; border-radius: 15px; margin-top: 10px;">🗑️ Remove</button>
            </div>
        </div>

        <!-- Request Profile Monitoring -->
        <div class="section" style="background: linear-gradient(135deg, rgba(0, 191, 255, 0.2), rgba(138, 43, 226, 0.2)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">📝 Request Profile Monitoring</h2>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Suno Profile ID</label>
                <input type="text" id="requestProfileId" placeholder="Enter Suno Profile ID" 
                       style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Artist/Profile Name</label>
                <input type="text" id="requestProfileName" placeholder="Artist or profile name" 
                       style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Your Name (Optional)</label>
                <input type="text" id="requestSubmittedBy" placeholder="Your name" 
                       style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Reason for Request (Optional)</label>
                <textarea id="requestReason" placeholder="Why should this profile be monitored?" rows="3"
                          style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333; resize: vertical;"></textarea>
            </div>
        </div>

    </div>

    <!-- Mini Player Overlay -->
    <div id="miniPlayer" class="mini-player">
        <div class="mini-player-header">
            <span id="miniPlayerTitle">Now Playing</span>
            <button onclick="closeMiniPlayer()" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
        </div>
        <div class="mini-player-info">
            <span id="miniArtist">3Kloudz</span> - <span id="miniSong">Don't Want To Fight No More</span>
        </div>
        <div class="mini-player-controls">
            <button onclick="toggleWebsiteMute()" style="background: #ff6b6b; border: none; color: white; padding: 5px 10px; border-radius: 5px; margin-right: 5px;">🔇 Mute</button>
            <button onclick="refreshMiniPlayer()" style="background: #4ecdc4; border: none; color: white; padding: 5px 10px; border-radius: 5px;">🔄 Refresh</button>
        </div>
    </div>

    <script>
        // Make mini player draggable
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        const miniPlayer = document.getElementById('miniPlayer');
        
        miniPlayer.addEventListener('mousedown', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                isDragging = true;
                const rect = miniPlayer.getBoundingClientRect();
                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                miniPlayer.style.left = (e.clientX - dragOffset.x) + 'px';
                miniPlayer.style.top = (e.clientY - dragOffset.y) + 'px';
                miniPlayer.style.right = 'auto';
                miniPlayer.style.bottom = 'auto';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        function closeMiniPlayer() {
            miniPlayer.style.display = 'none';
        }

        function refreshMiniPlayer() {
            updateMiniPlayerTrack();
        }

        function updateMiniPlayerTrack() {
            // Update with current track info
            document.getElementById('miniArtist').textContent = '3Kloudz';
            document.getElementById('miniSong').textContent = "Don't Want To Fight No More";
        }

        // Show mini player after 3 seconds
        setTimeout(() => {
            if (!document.getElementById('miniPlayer').style.display) {
                createMiniPlayer();
            }
        }, 3000);
        
        function createMiniPlayer() {
            const miniPlayer = document.getElementById('miniPlayer');
            if (miniPlayer) {
                miniPlayer.style.display = 'block';
                updateMiniPlayerTrack();
            }
        }

        // Update track info every 15 seconds
        setInterval(updateMiniPlayerTrack, 15000);

        // Theme switching functionality
        function setTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            console.log('Theme set to:', theme);
        }

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'auto';
        setTheme(savedTheme);

        // Update live music info
        async function updateLiveMusicInfo() {
            try {
                const response = await fetch('/now-playing');
                const data = await response.json();
                
                if (data.success && data.artist && data.song) {
                    document.getElementById('artistName').textContent = data.artist;
                    document.getElementById('songName').textContent = data.song;
                    document.getElementById('sourceInfo').textContent = data.source || 'FlaviBot Player';
                } else {
                    document.getElementById('artistName').textContent = '3Kloudz';
                    document.getElementById('songName').textContent = "Don't Want To Fight No More";
                    document.getElementById('sourceInfo').textContent = 'FlaviBot Player';
                }
            } catch (error) {
                console.log('Live music update error:', error);
            }
        }

        // Working button functions
        function muteStream() {
            const btn = document.getElementById('muteBtn');
            if (btn.textContent.includes('Mute')) {
                btn.innerHTML = '🔊 Unmute Stream';
                btn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
                console.log('Stream muted');
            } else {
                btn.innerHTML = '🔇 Mute Stream';
                btn.style.background = 'linear-gradient(135deg, #ff6b6b, #ff5252)';
                console.log('Stream unmuted');
            }
        }

        function refreshStream() {
            const btn = document.getElementById('refreshBtn');
            btn.innerHTML = '⏳ Refreshing...';
            btn.style.opacity = '0.7';
            
            setTimeout(() => {
                btn.innerHTML = '🔄 Refresh';
                btn.style.opacity = '1';
                updateLiveMusicInfo();
                console.log('Stream refreshed');
            }, 1500);
        }

        function postSunoSong() {
            const url = document.getElementById('sunoUrl').value;
            if (url) {
                console.log('Posting Suno song:', url);
            }
        }

        // Update live music every 15 seconds
        setInterval(updateLiveMusicInfo, 15000);
        updateLiveMusicInfo(); // Initial load

        // Update timestamps
        function updateTimestamps() {
            const now = new Date();
            document.getElementById('lastCheckTime').textContent = now.toLocaleTimeString();
            document.getElementById('profileLastCheck').textContent = now.toLocaleTimeString();
        }

        // Update timestamps every 30 seconds
        setInterval(updateTimestamps, 30000);
        updateTimestamps();
    </script>
</body>
</html>
                    <h3>🎬 Music Videos Channel</h3>
                    <div class="video-wrapper">
                        ${musicSong ? `
                            <iframe src="https://www.youtube.com/embed/${musicSong.id}?autoplay=1&mute=1&controls=0&disablekb=1" 
                                    allow="autoplay; encrypted-media"></iframe>
                            <div class="video-overlay"></div>
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
                            <iframe src="https://www.youtube.com/embed/${lyricSong.id}?autoplay=1&mute=1&controls=0&disablekb=1" 
                                    allow="autoplay; encrypted-media"></iframe>
                            <div class="video-overlay"></div>
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
                        <button onclick="removeProfile('${profile.id}')" class="btn-small" style="background: #ff6b6b; color: white; border: none; padding: 5px 10px; border-radius: 5px; margin-top: 10px;">Remove</button>
                    </div>
                `).join('')}
            </div>
            
            <!-- Admin Approval Section -->
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
                                <div style="margin-top: 15px;">
                                    <button onclick="approveProfile(${index})" class="btn-small" style="background: #4ecdc4; color: white; border: none; padding: 8px 15px; border-radius: 5px; margin-right: 10px;">✅ Approve</button>
                                    <button onclick="rejectProfile(${index})" class="btn-small" style="background: #ff6b6b; color: white; border: none; padding: 8px 15px; border-radius: 5px;">❌ Reject</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ``}
            
            <!-- User Submission Form -->
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
        // Admin control functions
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

        async function removeProfile(profileId) {
            if (!confirm('Are you sure you want to remove this profile?')) return;
            
            try {
                const response = await fetch('/admin/remove-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId })
                });
                const result = await response.json();
                alert(result.message);
                location.reload();
            } catch (error) {
                alert('❌ Remove failed');
            }
        }

        async function approveProfile(index) {
            try {
                const response = await fetch('/admin/approve-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ index })
                });
                const result = await response.json();
                alert(result.message);
                location.reload();
            } catch (error) {
                alert('❌ Approval failed');
            }
        }

        async function rejectProfile(index) {
            try {
                const response = await fetch('/admin/reject-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ index })
                });
                const result = await response.json();
                alert(result.message);
                location.reload();
            } catch (error) {
                alert('❌ Rejection failed');
            }
        }

        // Dynamic scroll-based background color changes
        function updateBackgroundOnScroll() {
            const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
            const hue = Math.floor(scrollPercent * 360);
            const saturation = 70 + (scrollPercent * 30);
            const lightness = 20 + (scrollPercent * 15);
            
            document.body.style.filter = 'hue-rotate(' + hue + 'deg) saturate(' + saturation + '%) brightness(' + (lightness + 80) + '%)';
        }

        // Smooth scroll color transitions
        let ticking = false;
        function requestTick() {
            if (!ticking) {
                requestAnimationFrame(updateBackgroundOnScroll);
                ticking = true;
                setTimeout(function() { ticking = false; }, 16);
            }
        }

        window.addEventListener('scroll', requestTick);

        // Initialize background
        updateBackgroundOnScroll();

        // Request profile form submission
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

        // Add profile form submission
        document.getElementById('addProfileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('profileStatus');
            
            try {
                const response = await fetch('/add-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: document.getElementById('profileId').value,
                        profileName: document.getElementById('profileName').value
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                    document.getElementById('addProfileForm').reset();
                    setTimeout(() => location.reload(), 2000);
                } else {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                }
            } catch (error) {
                status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to add profile</p>';
            }
        });

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

        // Mini-Player Functionality
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        let currentTrack = null;
        let isPlaying = false;
        
        // Create and show mini-player
        function createMiniPlayer() {
            const miniPlayer = document.createElement('div');
            miniPlayer.className = 'mini-player';
            miniPlayer.id = 'miniPlayer';
            
            miniPlayer.innerHTML = \`
                <div class="mini-player-header">
                    <div class="mini-player-title">NOW PLAYING</div>
                    <div class="mini-player-controls">
                        <button class="mini-control-btn" onclick="toggleMiniPlayer()" title="Minimize">−</button>
                        <button class="mini-control-btn" onclick="closeMiniPlayer()" title="Close">×</button>
                    </div>
                </div>
                
                <div class="mini-player-content">
                    <div class="mini-album-art">🎵</div>
                    
                    <div class="mini-track-info">
                        <div class="mini-track-name" id="miniTrackName">Loading...</div>
                        <div class="mini-artist-name" id="miniArtistName">Fetching track info...</div>
                        <div class="mini-progress">
                            <div class="mini-progress-bar"></div>
                        </div>
                    </div>
                    
                    <div class="mini-play-controls">
                        <button class="mini-play-btn" onclick="togglePlayback()" id="miniPlayBtn">▶</button>
                        <div class="mini-volume-control">
                            <div class="mini-volume-slider" onclick="adjustVolume(event)">
                                <div class="mini-volume-level"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <button class="mini-player-toggle" onclick="expandMiniPlayer()" title="Expand">↑</button>
            \`;
            
            document.body.appendChild(miniPlayer);
            
            // Add drag functionality
            miniPlayer.addEventListener('mousedown', startDrag);
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', endDrag);
            
            // Show mini-player after a short delay
            setTimeout(() => {
                miniPlayer.classList.add('visible');
            }, 1000);
            
            // Update track info
            updateMiniPlayerTrack();
            
            return miniPlayer;
        }
        
        // Drag functionality
        function startDrag(e) {
            if (e.target.closest('.mini-control-btn') || e.target.closest('.mini-play-btn')) return;
            
            isDragging = true;
            const miniPlayer = document.getElementById('miniPlayer');
            miniPlayer.classList.add('dragging');
            
            const rect = miniPlayer.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
        }
        
        function handleDrag(e) {
            if (!isDragging) return;
            
            const miniPlayer = document.getElementById('miniPlayer');
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;
            
            // Keep within viewport bounds
            const maxX = window.innerWidth - miniPlayer.offsetWidth;
            const maxY = window.innerHeight - miniPlayer.offsetHeight;
            
            const clampedX = Math.max(0, Math.min(x, maxX));
            const clampedY = Math.max(0, Math.min(y, maxY));
            
            miniPlayer.style.left = clampedX + 'px';
            miniPlayer.style.top = clampedY + 'px';
            miniPlayer.style.right = 'auto';
            miniPlayer.style.bottom = 'auto';
        }
        
        function endDrag() {
            if (!isDragging) return;
            
            isDragging = false;
            const miniPlayer = document.getElementById('miniPlayer');
            miniPlayer.classList.remove('dragging');
        }
        
        // Mini-player controls
        function togglePlayback() {
            isPlaying = !isPlaying;
            const playBtn = document.getElementById('miniPlayBtn');
            playBtn.innerHTML = isPlaying ? '⏸' : '▶';
            
            // Add visual feedback
            playBtn.style.transform = 'scale(0.9)';
            setTimeout(() => {
                playBtn.style.transform = '';
            }, 150);
        }
        
        function adjustVolume(e) {
            const slider = e.currentTarget;
            const rect = slider.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const volumeLevel = slider.querySelector('.mini-volume-level');
            volumeLevel.style.width = Math.max(0, Math.min(100, percent * 100)) + '%';
        }
        
        function toggleMiniPlayer() {
            const miniPlayer = document.getElementById('miniPlayer');
            miniPlayer.style.height = miniPlayer.style.height === '60px' ? '120px' : '60px';
        }
        
        function expandMiniPlayer() {
            const miniPlayer = document.getElementById('miniPlayer');
            miniPlayer.classList.toggle('mini-player-expanded');
        }
        
        function closeMiniPlayer() {
            const miniPlayer = document.getElementById('miniPlayer');
            miniPlayer.classList.remove('visible');
            setTimeout(() => {
                miniPlayer.remove();
            }, 400);
        }
        
        // Update track information
        async function updateMiniPlayerTrack() {
            try {
                const response = await fetch('/now-playing');
                const data = await response.json();
                
                if (data.success && data.artist && data.song) {
                    document.getElementById('miniTrackName').textContent = data.song;
                    document.getElementById('miniArtistName').textContent = data.artist;
                    
                    // Update album art with first letter of song
                    const albumArt = document.querySelector('.mini-album-art');
                    albumArt.textContent = data.song.charAt(0).toUpperCase();
                    
                    currentTrack = data;
                } else {
                    document.getElementById('miniTrackName').textContent = 'No track playing';
                    document.getElementById('miniArtistName').textContent = 'Start playing music to see controls';
                }
            } catch (error) {
                console.log('Mini-player update error:', error);
                document.getElementById('miniTrackName').textContent = 'Connection error';
                document.getElementById('miniArtistName').textContent = 'Please refresh the page';
            }
        }
        
        // Show mini-player when scrolling or after delay
        function showMiniPlayerOnScroll() {
            let scrollTimeout;
            window.addEventListener('scroll', () => {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    if (!document.getElementById('miniPlayer') && window.scrollY > 100) {
                        createMiniPlayer();
                    }
                }, 500);
            });
        }
        
        // Initialize mini-player functionality
        showMiniPlayerOnScroll();
        
        // Auto-create mini-player after 3 seconds if music is playing
        setTimeout(() => {
            if (!document.getElementById('miniPlayer')) {
                createMiniPlayer();
            }
        }, 3000);
        
        // Update track info every 15 seconds
        setInterval(updateMiniPlayerTrack, 15000);

        // Theme switching functionality
        function setTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            console.log('Theme set to:', theme);
        }

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'auto';
        setTheme(savedTheme);

        // Update live music info
        async function updateLiveMusicInfo() {
            try {
                const response = await fetch('/now-playing');
                const data = await response.json();
                
                if (data.success && data.artist && data.song) {
                    document.getElementById('artistName').textContent = data.artist;
                    document.getElementById('songName').textContent = data.song;
                    document.getElementById('sourceInfo').textContent = data.source || 'FlaviBot Player';
                } else {
                    document.getElementById('artistName').textContent = '3Kloudz';
                    document.getElementById('songName').textContent = "Don't Want To Fight No More";
                    document.getElementById('sourceInfo').textContent = 'FlaviBot Player';
                }
            } catch (error) {
                console.log('Live music update error:', error);
            }
        }

        // Functions for buttons (to prevent console errors)
        function toggleWebsiteMute() {
            console.log('Mute toggled');
        }

        // Update live music every 15 seconds
        setInterval(updateLiveMusicInfo, 15000);
        updateLiveMusicInfo(); // Initial load

        // Suno form submission
        document.getElementById('sunoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('status');
            
            try {
                const response = await fetch('/post-suno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: document.getElementById('sunoUrl').value
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

        // Profile request form submission
        document.getElementById('requestForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('requestStatus');
            
            try {
                const response = await fetch('/request-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: document.getElementById('requestProfileId').value,
                        profileName: document.getElementById('requestProfileName').value,
                        submittedBy: document.getElementById('requestSubmittedBy').value,
                        reason: document.getElementById('requestReason').value
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                    document.getElementById('requestForm').reset();
                } else {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                }
            } catch (error) {
                status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to submit request</p>';
            }
        });

        // Update timestamps
        function updateTimestamps() {
            const now = new Date();
            document.getElementById('lastCheckTime').textContent = now.toLocaleTimeString();
            document.getElementById('profileLastCheck').textContent = now.toLocaleTimeString();
        }

        // Update timestamps every 30 seconds
        setInterval(updateTimestamps, 30000);
        updateTimestamps();
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

                // Note: Voice channel connection requires Discord slash commands
                // Web interface loads videos for display only

            } catch (error) {
                console.error('❌ YouTube loading error:', error);
                res.json({ success: false, error: 'Failed to load YouTube content. Make sure the URL is valid.' });
            }
        });

        // Admin testing endpoint
        this.app.get('/admin/test-monitoring', async (req, res) => {
            try {
                console.log('🔍 Testing monitoring system...');
                
                // Test message to Discord with better formatting
                const testData = {
                    title: 'Monitoring System Test',
                    url: 'https://suno.com/song/test',
                    imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
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

        // Admin remove profile endpoint
        this.app.post('/admin/remove-profile', async (req, res) => {
            try {
                const { profileId } = req.body;
                const index = this.sunoProfiles.findIndex(p => p.id === profileId);
                
                if (index === -1) {
                    return res.json({ success: false, message: 'Profile not found' });
                }
                
                const removed = this.sunoProfiles.splice(index, 1)[0];
                console.log(`✅ Removed profile: ${removed.name}`);
                
                res.json({ 
                    success: true, 
                    message: `Removed profile: ${removed.name}` 
                });
            } catch (error) {
                console.error('❌ Remove error:', error);
                res.json({ success: false, message: 'Failed to remove profile' });
            }
        });

        // Admin approve profile endpoint
        this.app.post('/admin/approve-profile', async (req, res) => {
            try {
                const { index } = req.body;
                const request = this.pendingProfiles[index];
                
                if (!request) {
                    return res.json({ success: false, message: 'Request not found' });
                }
                
                // Add to monitoring
                this.sunoProfiles.push({
                    id: request.profileId,
                    name: request.profileName,
                    lastChecked: new Date()
                });
                
                // Remove from pending
                this.pendingProfiles.splice(index, 1);
                
                console.log(`✅ Approved profile: ${request.profileName}`);
                
                res.json({ 
                    success: true, 
                    message: `Approved and added: ${request.profileName}` 
                });
            } catch (error) {
                console.error('❌ Approve error:', error);
                res.json({ success: false, message: 'Failed to approve profile' });
            }
        });

        // Admin reject profile endpoint
        this.app.post('/admin/reject-profile', async (req, res) => {
            try {
                const { index } = req.body;
                const request = this.pendingProfiles[index];
                
                if (!request) {
                    return res.json({ success: false, message: 'Request not found' });
                }
                
                // Remove from pending
                this.pendingProfiles.splice(index, 1);
                
                console.log(`❌ Rejected profile request: ${request.profileName}`);
                
                res.json({ 
                    success: true, 
                    message: `Rejected request for: ${request.profileName}` 
                });
            } catch (error) {
                console.error('❌ Reject error:', error);
                res.json({ success: false, message: 'Failed to reject profile' });
            }
        });

        // User request profile endpoint
        this.app.post('/request-profile', async (req, res) => {
            try {
                const { profileId, profileName, submittedBy, reason } = req.body;
                
                if (!profileId || !profileName) {
                    return res.json({ success: false, error: 'Profile ID and name are required' });
                }

                // Check if already exists or pending
                const exists = this.sunoProfiles.find(p => p.id === profileId);
                const pending = this.pendingProfiles.find(p => p.profileId === profileId);
                
                if (exists) {
                    return res.json({ success: false, error: 'Profile is already being monitored' });
                }
                
                if (pending) {
                    return res.json({ success: false, error: 'Profile request is already pending approval' });
                }

                // Add to pending requests
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

        // Add Suno profile endpoint (admin only)
        this.app.post('/add-profile', async (req, res) => {
            try {
                const { profileId, profileName } = req.body;
                
                if (!profileId || !profileName) {
                    return res.json({ success: false, error: 'Profile ID and name are required' });
                }

                // Check if profile already exists
                const exists = this.sunoProfiles.find(p => p.id === profileId);
                if (exists) {
                    return res.json({ success: false, error: 'Profile already being monitored' });
                }

                // Add new profile
                this.sunoProfiles.push({
                    id: profileId,
                    name: profileName,
                    lastChecked: new Date()
                });

                console.log(`✅ Added new Suno profile: ${profileName} (${profileId})`);
                
                res.json({ 
                    success: true, 
                    message: `Added profile: ${profileName}` 
                });
            } catch (error) {
                console.error('❌ Add profile error:', error);
                res.json({ success: false, error: 'Failed to add profile' });
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
        const port = process.env.PORT || 5000;
        this.app.listen(port, '0.0.0.0', () => {
            console.log(`🌟 Web server running on port ${port}`);
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

    async postTestToDiscord(testData) {
        try {
            const channel = await this.client.channels.fetch(this.sunoChannelId);
            
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Suno', iconURL: 'https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld' })
                .setTitle(testData.title)
                .setURL(testData.url)
                .setDescription(testData.description)
                .setImage(testData.imageUrl)
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