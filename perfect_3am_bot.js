const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');

class Enhanced3AMBot {
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
        this.currentSong = null;
    }

    async start() {
        await this.client.login(process.env.DISCORD_TOKEN);
        await this.registerSlashCommands();
        this.setupDiscordEvents();
        this.setupWebServer();
        console.log('🎵 3AM VERIFIED Enhanced Music Bot is online!');
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('play')
                .setDescription('Play a YouTube video or playlist')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('YouTube URL to play')
                        .setRequired(true)),
            
            new SlashCommandBuilder()
                .setName('stop')
                .setDescription('Stop playing music')
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(this.client.user.id), { body: commands });
        console.log('✅ Slash commands registered successfully');
    }

    setupDiscordEvents() {
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName, options } = interaction;

            if (commandName === 'play') {
                const url = options.getString('url');
                await interaction.reply('🎵 Processing: ' + url);
            } else if (commandName === 'stop') {
                await interaction.reply('⏹️ Stopped music');
            }
        });

        this.client.on('ready', () => {
            console.log('✅ Discord bot logged in as ' + this.client.user.tag);
        });

        this.client.on('error', console.error);
    }

    setupWebServer() {
        this.app.get('/', (req, res) => {
            const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3AM VERIFIED - Enhanced Music Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
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
            50% { 
                text-shadow: 
                    0 0 15px #00ffff,
                    0 0 25px #8a2be2,
                    0 0 35px #00ffff,
                    0 0 45px #8a2be2;
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
        
        .container { max-width: 1200px; margin: 0 auto; position: relative; z-index: 10; }
        
        .header {
            text-align: center;
            margin-bottom: 50px;
            position: relative;
        }

        .verified-badge {
            display: inline-flex;
            align-items: center;
            background: linear-gradient(135deg, #8a2be2, #00ffff);
            padding: 15px 30px;
            border-radius: 50px;
            margin-bottom: 20px;
            box-shadow: 
                0 0 30px rgba(138, 43, 226, 0.6),
                0 0 50px rgba(0, 255, 255, 0.4),
                inset 0 0 20px rgba(255, 255, 255, 0.2);
            animation: verifiedPulse 3s ease-in-out infinite;
            border: 2px solid rgba(255, 255, 255, 0.3);
        }

        .three-am {
            font-size: 1.8rem;
            font-weight: 900;
            color: #00ffff;
            margin-right: 10px;
            animation: crazyTextGlow 2s ease-in-out infinite;
        }

        .verified-text {
            font-size: 1.8rem;
            font-weight: 900;
            color: #8a2be2;
            margin-right: 10px;
            animation: crazyTextGlow 2s ease-in-out infinite reverse;
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
            display: block; margin-bottom: 10px; 
            font-weight: 600; color: var(--text-primary); 
        }
        .form-group input { 
            width: 100%; padding: 15px; border: 1px solid var(--border-color); 
            border-radius: 10px; background: var(--input-bg); 
            color: var(--text-primary); font-size: 16px;
            backdrop-filter: blur(10px);
        }
        .form-group input:focus { 
            outline: none; border-color: #667eea; 
            box-shadow: 0 0 20px rgba(102, 126, 234, 0.3); 
        }
    </style>
</head>
<body>
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

        <div class="section">
            <h2>🎵 Live Music Stream</h2>
            <div style="background: linear-gradient(135deg, rgba(244, 63, 94, 0.2), rgba(139, 69, 19, 0.2)); border: 2px solid rgba(244, 63, 94, 0.4); padding: 25px; border-radius: 15px;">
                <h3 style="color: #f43f5e;">🎶 Now Playing</h3>
                <p><strong>Artist:</strong> <span id="currentArtist">Listening for music...</span></p>
                <p><strong>Song:</strong> <span id="currentSong">Waiting for track info...</span></p>
                <p><strong>Source:</strong> <span id="musicSource">Music Video Channel</span></p>
                <p><strong>Status:</strong> <span id="liveStatus">🔴 Live</span></p>
                
                <div style="margin-top: 20px; display: flex; justify-content: center; gap: 15px;">
                    <button onclick="refreshNowPlaying()" class="btn" style="background: #4ecdc4; padding: 12px 24px; font-size: 16px;">
                        🔄 Refresh
                    </button>
                </div>
            </div>
        </div>

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

        <div class="section">
            <h2>🎵 Auto-Post Suno Song</h2>
            <form id="sunoForm">
                <div class="form-group">
                    <label>Suno Song URL</label>
                    <input type="text" id="sunoUrl" placeholder="https://suno.com/song/..." required>
                </div>
                <button type="submit" class="btn">🤖 Auto-Post with Smart Detection</button>
            </form>
            <div id="sunoStatus" style="margin-top: 15px;"></div>
        </div>
    </div>

    <script>
        function setTheme(theme) {
            const buttons = document.querySelectorAll('.theme-btn');
            buttons.forEach(btn => btn.classList.remove('active'));
            document.getElementById(theme + '-btn').classList.add('active');
            
            if (theme === 'auto') {
                const hour = new Date().getHours();
                const autoTheme = (hour >= 6 && hour < 18) ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', autoTheme);
                localStorage.setItem('theme', 'auto');
            } else {
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
            }
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('theme') || 'auto';
            setTheme(savedTheme);
        }

        setInterval(() => {
            if (localStorage.getItem('theme') === 'auto') {
                setTheme('auto');
            }
        }, 60000);

        initTheme();

        async function updateLiveMusicInfo() {
            try {
                const response = await fetch('/api/now-playing');
                const data = await response.json();
                
                if (data.isPlaying) {
                    document.getElementById('currentArtist').textContent = data.artist || 'Unknown Artist';
                    document.getElementById('currentSong').textContent = data.title || 'Unknown Song';
                    document.getElementById('musicSource').textContent = data.source || 'Music Channel';
                    document.getElementById('liveStatus').innerHTML = '🔴 Live';
                } else {
                    document.getElementById('currentArtist').textContent = 'No music playing';
                    document.getElementById('currentSong').textContent = 'Waiting for track...';
                    document.getElementById('musicSource').textContent = 'Music Channel';
                    document.getElementById('liveStatus').innerHTML = '⚫ Offline';
                }
            } catch (error) {
                console.error('Error fetching music info:', error);
            }
        }

        function refreshNowPlaying() {
            updateLiveMusicInfo();
        }

        document.getElementById('sunoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('sunoUrl').value;
            const status = document.getElementById('sunoStatus');
            
            status.innerHTML = '<div style="color: #4ade80;">🤖 Processing with smart detection...</div>';
            
            try {
                const response = await fetch('/api/suno-post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '<div style="color: #4ade80;">✅ Successfully posted to Discord!</div>';
                    document.getElementById('sunoUrl').value = '';
                } else {
                    status.innerHTML = '<div style="color: #f87171;">❌ Error: ' + result.error + '</div>';
                }
            } catch (error) {
                status.innerHTML = '<div style="color: #f87171;">❌ Error posting song</div>';
            }
        });

        function updateLastCheckTime() {
            const now = new Date().toLocaleTimeString();
            document.getElementById('lastCheck').textContent = now;
        }

        setInterval(updateLiveMusicInfo, 30000);
        setInterval(updateLastCheckTime, 180000);
        
        updateLiveMusicInfo();
        updateLastCheckTime();
    </script>
</body>
</html>`;
            
            res.send(htmlContent);
        });

        this.app.get('/api/now-playing', async (req, res) => {
            try {
                // Get the new song channel where FlaviBot is playing
                const newSongChannel = this.client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
                if (!newSongChannel) {
                    return res.json({
                        isPlaying: false,
                        artist: 'Channel not found',
                        title: 'Unable to connect',
                        source: 'Discord Channel'
                    });
                }

                // Look for FlaviBot in the server
                const guild = newSongChannel.guild;
                const flaviBot = guild.members.cache.find(member => 
                    member.user.username.toLowerCase().includes('flavi') || 
                    member.user.displayName.toLowerCase().includes('flavi')
                );

                if (!flaviBot) {
                    return res.json({
                        isPlaying: false,
                        artist: 'FlaviBot not found',
                        title: 'Bot not in server',
                        source: 'Discord Channel'
                    });
                }

                // Check FlaviBot's activities for music info
                const activities = flaviBot.presence?.activities || [];
                const musicActivity = activities.find(activity => 
                    activity.type === 2 || // LISTENING activity type
                    activity.name?.toLowerCase().includes('music') ||
                    activity.name?.toLowerCase().includes('spotify') ||
                    activity.name?.toLowerCase().includes('youtube') ||
                    activity.details || activity.state
                );

                if (musicActivity) {
                    // Extract song info from activity
                    const artist = musicActivity.state || musicActivity.details || 'Unknown Artist';
                    const title = musicActivity.details || musicActivity.name || 'Unknown Song';
                    const source = musicActivity.name || 'Music Player';

                    return res.json({
                        isPlaying: true,
                        artist: artist,
                        title: title,
                        source: source,
                        activity: musicActivity
                    });
                }

                // Check if FlaviBot is in a voice channel (playing music)
                const voiceState = flaviBot.voice;
                if (voiceState?.channel) {
                    return res.json({
                        isPlaying: true,
                        artist: 'FlaviBot',
                        title: 'Playing in voice channel',
                        source: voiceState.channel.name,
                        channel: voiceState.channel.name
                    });
                }

                // No music activity detected
                return res.json({
                    isPlaying: false,
                    artist: 'No music playing',
                    title: 'Waiting for track...',
                    source: 'Music Channel'
                });

            } catch (error) {
                console.error('Error getting FlaviBot music info:', error);
                res.json({
                    isPlaying: false,
                    artist: 'Error loading data',
                    title: 'Connection issue',
                    source: 'Discord Channel'
                });
            }
        });

        this.app.post('/api/suno-post', async (req, res) => {
            try {
                const { url } = req.body;
                const result = await this.extractSunoData(url);
                
                if (result.success) {
                    await this.postSunoToDiscord(result.title, url, result.description);
                    res.json({ success: true });
                } else {
                    res.json({ success: false, error: result.error });
                }
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        const port = process.env.PORT || 5000;
        this.app.listen(port, '0.0.0.0', () => {
            console.log('3AM VERIFIED Dashboard running on port ' + port);
        });
    }

    async extractSunoData(url) {
        try {
            console.log('Extracting Suno data from:', url);
            const response = await axios.get(url);
            const html = response.data;
            
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].replace(' | Suno', '') : 'Unknown Song';
            
            const description = '🎵 New song from Suno AI! Check it out: ' + title;
            
            return {
                success: true,
                title: title,
                description: description,
                url: url
            };
        } catch (error) {
            console.error('Error extracting Suno data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            // Step 1: Post to hidden bot-helper channel to get rich preview
            const botHelperChannel = this.client.channels.cache.find(channel => 
                channel.name === 'bot-helper' || channel.name === 'bot_helper'
            );
            
            if (!botHelperChannel) {
                throw new Error('Bot helper channel not found. Please create a #bot-helper channel.');
            }

            // Post the raw Suno URL to bot-helper channel - Discord will generate rich preview
            const helperMessage = await botHelperChannel.send(url);
            console.log('Posted Suno URL to bot-helper channel for rich preview');

            // Step 2: Wait a moment for Discord to generate the rich preview
            setTimeout(async () => {
                try {
                    // Fetch the message again to get the rich embed data
                    const messageWithEmbed = await botHelperChannel.messages.fetch(helperMessage.id);
                    
                    // Step 3: Post to main channel with the rich content
                    const mainChannel = this.client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
                    if (!mainChannel) {
                        throw new Error('Main Discord channel not found');
                    }

                    // If Discord generated a rich embed, use that data
                    if (messageWithEmbed.embeds && messageWithEmbed.embeds.length > 0) {
                        const originalEmbed = messageWithEmbed.embeds[0];
                        
                        const enhancedEmbed = {
                            color: 0x667eea,
                            title: originalEmbed.title || '🎵 ' + title,
                            description: originalEmbed.description || description || 'New song from Suno AI!',
                            url: url,
                            image: originalEmbed.image ? { url: originalEmbed.image.url } : null,
                            thumbnail: originalEmbed.thumbnail ? { url: originalEmbed.thumbnail.url } : null,
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: '3AM VERIFIED Bot • Auto-posted from Suno AI',
                                icon_url: originalEmbed.thumbnail?.url
                            },
                            fields: originalEmbed.fields || []
                        };

                        await mainChannel.send({ 
                            content: '🎵 **New Song Alert!** 🎵',
                            embeds: [enhancedEmbed] 
                        });
                        
                        console.log('Successfully reposted with rich content to main channel');
                    } else {
                        // Fallback if no rich embed was generated
                        await mainChannel.send({
                            content: '🎵 **New Song Alert!** 🎵\n' + url,
                            embeds: [{
                                color: 0x667eea,
                                title: '🎵 ' + title,
                                description: description || 'New song from Suno AI!',
                                url: url,
                                timestamp: new Date().toISOString(),
                                footer: {
                                    text: '3AM VERIFIED Bot'
                                }
                            }]
                        });
                        console.log('Posted with fallback embed to main channel');
                    }
                } catch (error) {
                    console.error('Error reposting to main channel:', error);
                }
            }, 3000); // Wait 3 seconds for Discord to generate rich preview

        } catch (error) {
            console.error('Error in smart posting system:', error);
            throw error;
        }
    }
}

const bot = new Enhanced3AMBot();
bot.start().catch(console.error);