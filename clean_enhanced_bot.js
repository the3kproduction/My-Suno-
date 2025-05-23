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
            // Get video info
            const info = await ytdl.getInfo(url);
            const song = {
                title: info.videoDetails.title,
                url: url,
                id: info.videoDetails.videoId
            };

            // Add to playlist
            this.channels[channelType].playlist.push(song);
            
            // Join voice channel and start playing
            await this.joinVoiceChannel(interaction, channelType);
            await this.playCurrentSong(channelType);

            await interaction.editReply(`✅ Loaded and playing: **${song.title}** in ${channelType} channel!`);
        } catch (error) {
            console.error('❌ Load error:', error);
            await interaction.editReply('❌ Failed to load the video!');
        }
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
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; color: white; padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; }
        .header h1 { font-size: 3rem; margin-bottom: 10px; }
        .section {
            background: rgba(255,255,255,0.1); border-radius: 15px;
            padding: 30px; margin-bottom: 30px; backdrop-filter: blur(10px);
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 30px; }
        .video-container {
            background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden;
        }
        .video-container h3 { padding: 15px; font-size: 1.2rem; }
        .video-wrapper { height: 315px; background: #000; }
        .video-wrapper iframe { width: 100%; height: 100%; border: none; }
        .no-video {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 315px; color: #ccc;
        }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; }
        .form-group input, .form-group textarea {
            width: 100%; padding: 12px; border: none; border-radius: 8px;
            font-size: 16px; background: rgba(255,255,255,0.9);
        }
        .btn {
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4); color: white;
            border: none; padding: 12px 24px; border-radius: 8px;
            font-size: 16px; font-weight: 600; cursor: pointer;
            transition: transform 0.3s;
        }
        .btn:hover { transform: translateY(-2px); }
        .commands { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .command { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; }
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
            // Try to get page content to extract title
            const response = await axios.get(url);
            const html = response.data;
            
            // Extract title from HTML
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1].replace(' | Suno', '').trim() : 'Unknown Song';
            
            return { title, url };
        } catch (error) {
            console.error('❌ Error extracting Suno data:', error);
            return { title: 'Unknown Song', url };
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            const channel = await this.client.channels.fetch(this.sunoChannelId);
            
            const embed = new EmbedBuilder()
                .setTitle('🎵 New Suno Song')
                .setDescription(`**${title}**\n\n${description}\n\n[Listen Here](${url})`)
                .setColor('#FF6B6B')
                .setTimestamp();

            const message = `🎵 New Suno song: **${title}** — ${url}`;
            
            await channel.send({ content: message, embeds: [embed] });
            console.log(`✅ Posted to Discord: ${title}`);
        } catch (error) {
            console.error('❌ Discord posting error:', error);
            throw error;
        }
    }
}

// Start the bot
const bot = new EnhancedMusicBot();
bot.start().catch(console.error);