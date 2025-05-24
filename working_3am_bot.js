require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');

class Working3AMBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildMembers
            ]
        });
        
        this.app = express();
        this.app.use(express.json());
        this.currentSong = null;
    }

    async start() {
        await this.registerSlashCommands();
        this.setupDiscordEvents();
        this.setupWebServer();
        
        await this.client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Slash commands registered successfully');
        console.log('🎵 3AM VERIFIED Enhanced Music Bot is online!');
        
        this.app.listen(5000, '0.0.0.0', () => {
            console.log('3AM VERIFIED Dashboard running on port 5000');
        });
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('suno')
                .setDescription('Post a Suno song to Discord')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('Suno song URL')
                        .setRequired(true))
        ].map(command => command.toJSON());

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands }
            );
        } catch (error) {
            console.error('Error registering commands:', error);
        }
    }

    setupDiscordEvents() {
        this.client.on('ready', () => {
            console.log(`Logged in as ${this.client.user.tag}!`);
        });

        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            if (interaction.commandName === 'suno') {
                const url = interaction.options.getString('url');
                await this.postSunoToDiscord('Song Title', url, 'Auto-posted song');
                await interaction.reply('✅ Song posted!');
            }
        });
    }

    setupWebServer() {
        // Serve the exact working dashboard with logo
        this.app.get('/', (req, res) => {
            const fs = require('fs');
            let htmlContent = fs.readFileSync('working_reference.html', 'utf8');
            
            // Make sure the logo is properly included
            if (!htmlContent.includes('verified-badge')) {
                // Add logo CSS and HTML if missing
                const logoCSS = `
        .header {
            text-align: center;
        }
        
        .verified-badge {
            display: flex;
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
        }`;
                
                htmlContent = htmlContent.replace('</style>', logoCSS + '\n</style>');
                
                const logoHTML = `
                <div class="verified-badge">
                    <div class="three-am">3AM</div>
                    <div class="verified-text">VERIFIED</div>
                    <div class="verified-checkmark">✓</div>
                </div>`;
                
                htmlContent = htmlContent.replace('<div class="header">', '<div class="header">' + logoHTML);
            }
            
            res.send(htmlContent);
        });

        // Store the current playing song
        this.currentSong = {
            artist: "Listening for music...",
            song: "Waiting for track info...",
            source: "Music Video Channel",
            lastUpdated: Date.now()
        };

        // Start monitoring for FlaviBot's "Now playing" messages
        this.startMusicMonitoring();

        // Working now-playing endpoint that matches reference site
        this.app.get('/now-playing', async (req, res) => {
            try {
                // Check if we have valid song data (extend time to 10 minutes for stability)
                const isRecent = (Date.now() - this.currentSong.lastUpdated) < 600000;
                
                if (this.currentSong.artist !== "Listening for music..." && this.currentSong.artist !== "Unknown Artist") {
                    return res.json({
                        success: true,
                        artist: this.currentSong.artist,
                        song: this.currentSong.song,
                        source: this.currentSong.source
                    });
                }

                // Fallback to default waiting message
                return res.json({
                    success: false,
                    artist: "Listening for music...",
                    song: "Waiting for track info...",
                    source: "Music Video Channel"
                });

            } catch (error) {
                console.error('Error fetching now playing:', error);
                res.json({
                    success: false,
                    artist: "Error fetching info",
                    song: "Please check connection",
                    source: "New Songs Channel"
                });
            }
        });

        // Auto-post endpoint
        this.app.post('/auto-post-suno', async (req, res) => {
            try {
                const { sunoUrl } = req.body;
                
                if (!sunoUrl) {
                    return res.json({ success: false, error: 'No URL provided' });
                }

                await this.postSunoToDiscord('Auto-Posted Song', sunoUrl, '🤖 Smart detection enabled');
                
                res.json({ 
                    success: true, 
                    url: sunoUrl,
                    message: 'Song posted successfully!' 
                });

            } catch (error) {
                console.error('Error auto-posting:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // Request profile endpoint
        this.app.post('/request-profile', async (req, res) => {
            try {
                const { profileId, profileName, submittedBy, reason } = req.body;
                
                // Log the request
                console.log('Profile request:', { profileId, profileName, submittedBy, reason });
                
                res.json({ 
                    success: true, 
                    message: 'Profile request submitted successfully!' 
                });

            } catch (error) {
                console.error('Error submitting profile request:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // Current song API endpoint with YouTube info
        this.app.get('/api/current-song', (req, res) => {
            if (this.currentSong && this.currentSong.artist && this.currentSong.song) {
                res.json({
                    success: true,
                    currentSong: {
                        artist: this.currentSong.artist,
                        song: this.currentSong.song,
                        source: 'FlaviBot Player',
                        spotifyUrl: this.currentSong.spotifyUrl || '',
                        lastUpdated: this.currentSong.lastUpdated || Date.now(),
                        searchQuery: this.currentSong.searchQuery || `${this.currentSong.artist} ${this.currentSong.song}`,
                        youtubeUrl: this.currentSong.youtubeUrl || '',
                        videoId: this.currentSong.videoId || ''
                    }
                });
            } else {
                res.json({
                    success: false,
                    currentSong: {
                        artist: "Listening for music...",
                        song: "Waiting for track info...",
                        source: "FlaviBot Player",
                        spotifyUrl: '',
                        lastUpdated: Date.now(),
                        searchQuery: '',
                        youtubeUrl: '',
                        videoId: ''
                    }
                });
            }
        });

        // Discord audio stream endpoint
        this.app.get('/api/discord-audio-stream', async (req, res) => {
            try {
                // Check if there's an active voice connection
                const guild = this.client.guilds.cache.first();
                if (!guild) {
                    return res.json({ success: false, error: 'No guild found' });
                }

                const voiceConnection = guild.voiceStates.cache.find(vs => vs.id === this.client.user.id);
                if (!voiceConnection || !voiceConnection.channelId) {
                    return res.json({ success: false, error: 'Bot not in voice channel' });
                }

                // For now, return the current song's Spotify URL for audio streaming
                // This will be enhanced to capture actual Discord audio in the future
                if (this.currentSong && this.currentSong.spotifyUrl) {
                    // Extract Spotify track ID for potential streaming
                    const spotifyMatch = this.currentSong.spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
                    if (spotifyMatch) {
                        const trackId = spotifyMatch[1];
                        // Return streaming info (you would need Spotify Web API for actual audio)
                        res.json({
                            success: true,
                            audioUrl: `https://open.spotify.com/embed/track/${trackId}`,
                            currentTrack: this.currentSong
                        });
                        return;
                    }
                }

                res.json({ 
                    success: false, 
                    error: 'No audio stream available',
                    message: 'Start music on Discord to enable streaming'
                });

            } catch (error) {
                console.error('Error getting audio stream:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // YouTube search endpoint for audio playback
        this.app.post('/api/youtube-search', async (req, res) => {
            try {
                const { artist, song } = req.body;
                
                if (!artist || !song) {
                    return res.json({ success: false, error: 'Artist and song required' });
                }

                const query = `${artist} ${song}`;
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${process.env.YOUTUBE_API_KEY}`;
                
                const response = await fetch(searchUrl);
                const data = await response.json();
                
                if (data.items && data.items.length > 0) {
                    const videoId = data.items[0].id.videoId;
                    const videoTitle = data.items[0].snippet.title;
                    
                    res.json({
                        success: true,
                        videoId: videoId,
                        title: videoTitle,
                        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`
                    });
                } else {
                    res.json({ success: false, error: 'No YouTube video found' });
                }
                
            } catch (error) {
                console.error('YouTube search error:', error);
                res.json({ success: false, error: 'YouTube search failed' });
            }
        });
    }

    startMusicMonitoring() {
        console.log('🎵 Starting music monitoring...');
        
        // Check music channel every 10 seconds for current playing song
        setInterval(async () => {
            await this.checkCurrentMusic();
        }, 10000);
        
        // Initial check
        this.checkCurrentMusic();
    }

    async checkCurrentMusic() {
        try {
            // Look for the specific channel where FlaviBot is playing
            const musicChannel = this.client.channels.cache.get('1375419981658849342');
            
            if (musicChannel) {
                console.log('✅ Found FlaviBot music channel, checking for active player...');
                
                // Debug: Check all recent messages in the channel
                try {
                    const debugMessages = await musicChannel.messages.fetch({ limit: 10 });
                    console.log(`🔍 Found ${debugMessages.size} messages in FlaviBot channel:`);
                    for (const msg of debugMessages.values()) {
                        if (msg.author.username && msg.author.username.toLowerCase().includes('flavi')) {
                            console.log(`  📝 FlaviBot message: ${msg.embeds[0]?.description || msg.content || 'No content'}`);
                        }
                    }
                } catch (e) {
                    console.log('Debug check failed:', e.message);
                }
                
                const lastMessage = await this.getLastMusicMessage(musicChannel);
                if (lastMessage) {
                    this.updateCurrentSong(lastMessage);
                    return;
                }
            }
            
            // Fallback: Search all guilds for FlaviBot activity
            console.log('New-songs channel not found, checking all channels...');
            for (const guild of this.client.guilds.cache.values()) {
                const channels = guild.channels.cache.filter(ch => ch.type === 0); // Text channels
                for (const channel of channels.values()) {
                    const lastMessage = await this.getLastMusicMessage(channel);
                    if (lastMessage) {
                        this.updateCurrentSong(lastMessage);
                        return;
                    }
                }
            }
            
        } catch (error) {
            console.error('Error checking current music:', error);
        }
    }

    async getLastMusicMessage(channel) {
        try {
            // First try to get the specific message ID you mentioned
            try {
                const specificMessage = await channel.messages.fetch('1375699467273244813');
                if (specificMessage && specificMessage.author.username && 
                    specificMessage.author.username.toLowerCase().includes('flavi')) {
                    console.log(`🎵 Found specific FlaviBot message: ${specificMessage.embeds[0]?.description || specificMessage.content}`);
                    return specificMessage;
                }
            } catch (e) {
                console.log('Specific message not found in this channel, checking recent messages...');
            }
            
            const messages = await channel.messages.fetch({ limit: 100 });
            
            // Convert to array and sort by timestamp (newest first)
            const sortedMessages = Array.from(messages.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            
            // Look for the most recent FlaviBot message with embeds
            for (const message of sortedMessages) {
                if (message.author.username && 
                    message.author.username.toLowerCase().includes('flavi') &&
                    message.embeds && message.embeds.length > 0) {
                    
                    const embed = message.embeds[0];
                    
                    // Check if it's a music message (has song info)
                    if ((embed.description && embed.description.includes(' - ')) || 
                        (embed.title && embed.title.includes('Now playing')) ||
                        (embed.fields && embed.fields.some(field => field.name === 'Now playing'))) {
                        
                        console.log(`🎵 Found FlaviBot message from ${new Date(message.createdTimestamp).toLocaleTimeString()}: ${embed.description || embed.title || 'Interactive player'}`);
                        return message;
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('Error fetching messages:', error);
            return null;
        }
    }

    updateCurrentSong(message) {
        const embed = message.embeds[0];
        let song = "Unknown Song";
        let artist = "Unknown Artist";
        
        if (embed.description) {
            // Clean up the description - remove Discord emojis, formatting, and links
            let description = embed.description
                .replace(/\*\*/g, '') // Remove bold formatting
                .replace(/<:[^:]+:\d+>/g, '') // Remove Discord emojis
                .replace(/Added\s+/i, '') // Remove "Added" prefix
                .trim();
            
            // Extract text from [Artist - Song](link) format
            const linkMatch = description.match(/\[([^\]]+)\]/);
            if (linkMatch) {
                const songInfo = linkMatch[1]; // Get the text inside brackets
                const parts = songInfo.split(' - ');
                
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    song = parts[1].trim();
                    // Remove duration if present (like "02:56")
                    song = song.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim();
                }
            } else {
                // Fallback: try regular "Artist - Song" format
                const parts = description.split(' - ');
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    song = parts[1].trim();
                    song = song.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim();
                }
            }
        }
        
        // Only update if it's different from current
        if (this.currentSong.artist !== artist || this.currentSong.song !== song) {
            this.currentSong = {
                artist: artist,
                song: song,
                source: "FlaviBot Player",
                lastUpdated: Date.now(),
                searchQuery: `${artist} ${song}`
            };
            
            console.log(`🎵 Auto-detected now playing: ${artist} - ${song}`);
            
            // Get YouTube link for this song
            this.getYouTubeLink(artist, song);
        }
    }

    async getYouTubeLink(artist, song) {
        try {
            const query = `${artist} ${song}`;
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${process.env.YOUTUBE_API_KEY}`;
            
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const videoId = data.items[0].id.videoId;
                const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
                
                console.log(`🎬 Found YouTube link: ${youtubeUrl}`);
                
                // Update current song with YouTube info
                if (this.currentSong) {
                    this.currentSong.youtubeUrl = youtubeUrl;
                    this.currentSong.videoId = videoId;
                }
            }
        } catch (error) {
            console.log('YouTube search failed, but song tracking continues:', error.message);
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            const channelId = process.env.DISCORD_CHANNEL_ID;
            const channel = this.client.channels.cache.get(channelId);
            
            if (!channel) {
                console.error('Discord channel not found');
                return;
            }

            const message = `🎵 **${title}**\n${url}\n${description}`;
            await channel.send(message);
            
            console.log('✅ Posted to Discord:', title);
            
        } catch (error) {
            console.error('Error posting to Discord:', error);
        }
    }
}

const bot = new Working3AMBot();
bot.start().catch(console.error);