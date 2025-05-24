const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ChannelType, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
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
        this.botHelperChannelId = '1375615201990283304'; // Hidden channel for smart song extraction
        this.musicVideoChannelId = '1375615201990283303'; // Music Video channel where Flavibot plays
        
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
                    console.log(`🆕 New song found: ${song.title} - Auto-posting via clever system`);
                    
                    // Use the clever hidden channel system instead of direct posting
                    const botHelperChannel = await this.client.channels.fetch(this.botHelperChannelId);
                    await botHelperChannel.send(song.url);
                    
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

        // Smart channel monitoring for automatic song extraction
        this.client.on('messageCreate', async (message) => {
            // Monitor the bot-helper channel for ANY Suno links (including from bot itself)
            if (message.channel.id === this.botHelperChannelId) {
                await this.handleBotHelperMessage(message);
            }
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

    async handleBotHelperMessage(message) {
        try {
            // Check if the message contains a Suno link
            const sunoUrlMatch = message.content.match(/https:\/\/suno\.com\/s\/[\w-]+/);
            
            if (sunoUrlMatch) {
                const sunoUrl = sunoUrlMatch[0];
                console.log(`🔍 Found Suno link in bot-helper: ${sunoUrl}`);
                
                // Wait a moment for Discord to generate the embed
                setTimeout(async () => {
                    try {
                        // Fetch the message again to get the embed
                        const updatedMessage = await message.fetch();
                        
                        if (updatedMessage.embeds && updatedMessage.embeds.length > 0) {
                            const embed = updatedMessage.embeds[0];
                            
                            // Extract song data from Discord's embed
                            const songTitle = embed.title || 'Unknown Song';
                            const songDescription = embed.description || 'Fresh beats from Suno AI!';
                            const songImage = embed.image?.url || embed.thumbnail?.url;
                            
                            console.log(`🎵 Extracted from Discord embed: ${songTitle}`);
                            
                            // Post to main channel with extracted data
                            await this.postSmartSunoToDiscord(songTitle, sunoUrl, songDescription, songImage);
                            
                            // React to the helper message to show it was processed
                            await message.react('✅');
                            
                        } else {
                            console.log('⚠️ No embed found, falling back to manual extraction');
                            // Fallback to our manual extraction
                            await this.postSunoToDiscord('Unknown Song', sunoUrl, 'Posted via bot-helper');
                            await message.react('❓');
                        }
                    } catch (error) {
                        console.error('❌ Error processing bot-helper message:', error);
                        await message.react('❌');
                    }
                }, 3000); // Wait 3 seconds for Discord to generate embed
            }
        } catch (error) {
            console.error('❌ Error handling bot-helper message:', error);
        }
    }

    async postSmartSunoToDiscord(title, url, description, imageUrl) {
        try {
            const channel = await this.client.channels.fetch(this.sunoChannelId);
            
            // Create premium embed with extracted data
            const embed = new EmbedBuilder()
                .setAuthor({ 
                    name: '🎵 Suno AI Music', 
                    iconURL: 'https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld' 
                })
                .setTitle(`🔥 ${title}`)
                .setURL(url)
                .setColor(0x7C3AED) // Premium purple color
                .setTimestamp()
                .setFooter({ 
                    text: '3AM VERIFIED • Smart Auto-Post' 
                });

            // Add description
            embed.setDescription(`🎶 **${description}**\n\n🔗 [Listen on Suno](${url})`);

            // Add artwork (from Discord embed or fallback)
            if (imageUrl) {
                embed.setImage(imageUrl);
                embed.setThumbnail(imageUrl);
            } else {
                const defaultArtwork = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop&crop=center';
                embed.setImage(defaultArtwork);
                embed.setThumbnail('https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld');
            }

            // Add premium fields
            embed.addFields([
                { 
                    name: '🎤 Song Title', 
                    value: title, 
                    inline: false 
                },
                { 
                    name: '🌟 Status', 
                    value: '🤖 Smart Auto-Posted', 
                    inline: true 
                },
                { 
                    name: '⚡ Source', 
                    value: '3AM VERIFIED Bot', 
                    inline: true 
                }
            ]);

            // Send with reactions
            const message = await channel.send({ embeds: [embed] });
            
            // Add premium reactions
            await message.react('🔥');
            await message.react('💎');
            await message.react('🎯');
            
            console.log(`✅ Smart-posted Suno song to Discord: ${title}`);
        } catch (error) {
            console.error('❌ Smart Discord posting error:', error);
            throw error;
        }
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
        this.app.post('/auto-post-suno', async (req, res) => {
            try {
                const { sunoUrl } = req.body;
                
                if (!sunoUrl) {
                    return res.json({ success: false, error: 'Suno URL is required' });
                }

                console.log(`🤖 Auto-posting Suno URL to bot-helper: ${sunoUrl}`);
                
                // Post URL to the hidden bot-helper channel
                // This triggers our smart monitoring system
                const botHelperChannel = await this.client.channels.fetch(this.botHelperChannelId);
                await botHelperChannel.send(sunoUrl);
                
                res.json({ 
                    success: true, 
                    message: 'Song auto-posted with smart detection!',
                    url: sunoUrl
                });
            } catch (error) {
                console.error('❌ Auto-post Suno error:', error);
                res.json({ success: false, error: 'Failed to auto-post song' });
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

        // Approve profile endpoint
        this.app.post('/approve-profile', async (req, res) => {
            try {
                const { index } = req.body;
                
                if (index < 0 || index >= this.pendingProfiles.length) {
                    return res.json({ success: false, error: 'Invalid profile index' });
                }
                
                const request = this.pendingProfiles[index];
                
                // Add to monitoring list
                this.sunoProfiles.push({
                    id: request.profileId,
                    name: request.profileName,
                    lastChecked: new Date()
                });
                
                // Remove from pending
                this.pendingProfiles.splice(index, 1);
                
                console.log(`✅ Approved profile: ${request.profileName} (${request.profileId})`);
                
                res.json({ 
                    success: true, 
                    message: `Profile "${request.profileName}" approved and added to monitoring!` 
                });
            } catch (error) {
                console.error('❌ Approve profile error:', error);
                res.json({ success: false, error: 'Failed to approve profile' });
            }
        });

        // Deny profile endpoint
        this.app.post('/deny-profile', async (req, res) => {
            try {
                const { index } = req.body;
                
                if (index < 0 || index >= this.pendingProfiles.length) {
                    return res.json({ success: false, error: 'Invalid profile index' });
                }
                
                const request = this.pendingProfiles[index];
                
                // Remove from pending
                this.pendingProfiles.splice(index, 1);
                
                console.log(`❌ Denied profile: ${request.profileName} (${request.profileId})`);
                
                res.json({ 
                    success: true, 
                    message: `Profile "${request.profileName}" request denied and removed` 
                });
            } catch (error) {
                console.error('❌ Deny profile error:', error);
                res.json({ success: false, error: 'Failed to deny profile' });
            }
        });

        // Remove profile endpoint
        this.app.post('/remove-profile', async (req, res) => {
            try {
                const { index } = req.body;
                
                if (index < 0 || index >= this.sunoProfiles.length) {
                    return res.json({ success: false, error: 'Invalid profile index' });
                }
                
                const profile = this.sunoProfiles[index];
                
                // Remove from monitoring list
                this.sunoProfiles.splice(index, 1);
                
                console.log(`🗑️ Removed profile: ${profile.name} (${profile.id})`);
                
                res.json({ 
                    success: true, 
                    message: `Profile "${profile.name}" removed from monitoring` 
                });
            } catch (error) {
                console.error('❌ Remove profile error:', error);
                res.json({ success: false, error: 'Failed to remove profile' });
            }
        });

        // Now Playing endpoint for live music info
        this.app.get('/now-playing', async (req, res) => {
            try {
                // Check the new-songs channel for music player embeds
                const newSongsChannel = await this.client.channels.fetch(this.sunoChannelId);
                const messages = await newSongsChannel.messages.fetch({ limit: 10 });
                
                let currentTrack = {
                    artist: 'Listening for music...',
                    song: 'Waiting for track info...',
                    source: 'New Songs Player'
                };
                
                // Look for music player embeds or messages
                for (const message of messages.values()) {
                    // Check if message has embeds with music player info
                    if (message.embeds && message.embeds.length > 0) {
                        const embed = message.embeds[0];
                        console.log('🎵 Found embed:', {
                            author: embed.author?.name,
                            title: embed.title,
                            description: embed.description?.substring(0, 100)
                        });
                        
                        // Look for music player patterns in embed
                        if (embed.author?.name || embed.title || embed.description) {
                            const author = embed.author?.name || '';
                            const title = embed.title || '';
                            const description = embed.description || '';
                            
                            // Common music player patterns (including FlaviBot)
                            if (author.includes('Spotify') || title.includes('Spotify') || 
                                author.includes('YouTube') || title.includes('YouTube') ||
                                author.includes('FlaviBot') || title.includes('FlaviBot') ||
                                author.includes('Now playing') || description.includes('Now playing') || 
                                description.includes('♪') || title.includes('Now playing')) {
                                
                                // Extract from FlaviBot format: **[Artist - Song Title](link)** - `duration`
                                if (description && description.includes('**[') && description.includes('](')) {
                                    const match = description.match(/\*\*\[([^\]]+)\]\([^)]+\)\*\*/);
                                    if (match && match[1].includes(' - ')) {
                                        const parts = match[1].split(' - ');
                                        currentTrack.artist = parts[0].trim();
                                        currentTrack.song = parts.slice(1).join(' - ').trim();
                                        currentTrack.source = 'FlaviBot Player';
                                        break;
                                    }
                                }
                                
                                // Extract from title field (most common for music players)
                                if (title && title.includes(' - ')) {
                                    const parts = title.split(' - ');
                                    currentTrack.artist = parts[0].trim();
                                    currentTrack.song = parts[1].trim();
                                    currentTrack.source = author || 'Music Player';
                                    break;
                                }
                                
                                // Extract from description
                                if (description && description.includes(' - ')) {
                                    const parts = description.split(' - ');
                                    currentTrack.artist = parts[0].trim();
                                    currentTrack.song = parts[1].trim();
                                    currentTrack.source = author || 'Music Player';
                                    break;
                                }
                                
                                // Single title without artist separation
                                if (title && title.length > 0) {
                                    currentTrack.song = title.trim();
                                    currentTrack.artist = author || 'Unknown Artist';
                                    currentTrack.source = 'Music Player';
                                    break;
                                }
                            }
                        }
                        
                        // Check embed fields for track info
                        if (embed.fields && embed.fields.length > 0) {
                            let foundArtist = '';
                            let foundSong = '';
                            
                            for (const field of embed.fields) {
                                const fieldName = field.name.toLowerCase();
                                const fieldValue = field.value;
                                
                                if (fieldName.includes('artist') || fieldName.includes('by')) {
                                    foundArtist = fieldValue;
                                }
                                if (fieldName.includes('title') || fieldName.includes('song') || fieldName.includes('track')) {
                                    foundSong = fieldValue;
                                }
                            }
                            
                            if (foundArtist && foundSong) {
                                currentTrack.artist = foundArtist;
                                currentTrack.song = foundSong;
                                currentTrack.source = embed.author?.name || 'Music Player';
                                break;
                            }
                        }
                    }
                }
                
                res.json({
                    success: true,
                    artist: currentTrack.artist,
                    song: currentTrack.song,
                    source: currentTrack.source
                });
            } catch (error) {
                console.error('❌ Now playing error:', error);
                res.json({
                    success: false,
                    artist: 'Error fetching info',
                    song: 'Please check connection',
                    source: 'New Songs Channel'
                });
            }
        });

        const port = process.env.PORT || 10000;
        this.app.listen(port, '0.0.0.0', () => {
            console.log(`🌟 Web server running on port ${port}`);
        });
    }

    async extractSunoData(url) {
        try {
            console.log('🔍 Extracting Suno data from:', url);
            
            // Try with puppeteer for JavaScript-heavy pages
            let html;
            try {
                const puppeteer = require('puppeteer');
                const browser = await puppeteer.launch({ 
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
                
                // Wait for content to load
                await page.waitForTimeout(3000);
                
                html = await page.content();
                await browser.close();
                console.log('✅ Used Puppeteer for enhanced extraction');
            } catch (puppeteerError) {
                console.log('⚠️ Puppeteer failed, falling back to axios');
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    }
                });
                html = response.data;
            }
            
            let title = 'Unknown Song';
            let imageUrl = null;
            let description = '';
            
            // Try multiple patterns for title extraction
            const titlePatterns = [
                /<meta property="og:title" content="([^"]*)"[^>]*>/i,
                /<title[^>]*>([^<]*)<\/title>/i,
                /"title":\s*"([^"]*)"[^}]*>/i,
                /"name":\s*"([^"]*)"[^}]*>/i
            ];
            
            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1] && match[1].trim() !== '') {
                    title = match[1].trim();
                    // Clean up title - remove "Suno" and other common prefixes/suffixes
                    title = title.replace(/\s*-\s*Suno$/i, '').replace(/^Suno\s*-\s*/i, '').trim();
                    if (title && title !== 'Suno') break;
                }
            }
            
            // Try multiple patterns for image extraction
            const imagePatterns = [
                /<meta property="og:image" content="([^"]*)"[^>]*>/i,
                /<meta name="twitter:image" content="([^"]*)"[^>]*>/i,
                /"image_url":\s*"([^"]*)"[^}]*>/i,
                /"image":\s*"([^"]*)"[^}]*>/i,
                /"imageUrl":\s*"([^"]*)"[^}]*>/i,
                /"cover_url":\s*"([^"]*)"[^}]*>/i,
                /src="([^"]*\.(?:jpg|jpeg|png|webp|gif))"[^>]*>/gi
            ];
            
            for (const pattern of imagePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    imageUrl = match[1];
                    // Make sure it's a valid image URL
                    if (imageUrl.includes('http') && (imageUrl.includes('.jpg') || imageUrl.includes('.png') || imageUrl.includes('.webp') || imageUrl.includes('.jpeg'))) {
                        break;
                    }
                }
            }
            
            // Try to extract song ID and construct image URL if no image found
            if (!imageUrl) {
                const songIdMatch = url.match(/\/s\/([a-zA-Z0-9]+)/);
                if (songIdMatch) {
                    const songId = songIdMatch[1];
                    // Try common Suno image URL patterns
                    const possibleUrls = [
                        `https://cdn1.suno.ai/image_${songId}.jpeg`,
                        `https://cdn2.suno.ai/image_${songId}.png`,
                        `https://storage.googleapis.com/suno-ai/${songId}.jpg`
                    ];
                    // We'll try the first one as a fallback
                    imageUrl = possibleUrls[0];
                }
            }
            
            // Try multiple patterns for description
            const descPatterns = [
                /<meta property="og:description" content="([^"]*)"[^>]*>/i,
                /<meta name="description" content="([^"]*)"[^>]*>/i,
                /"prompt":\s*"([^"]*)"[^}]*>/i,
                /"lyrics":\s*"([^"]*)"[^}]*>/i
            ];
            
            for (const pattern of descPatterns) {
                const match = html.match(pattern);
                if (match && match[1] && match[1].trim() !== '') {
                    description = match[1].trim();
                    break;
                }
            }
            
            console.log('🎵 Extracted Suno data:', { title, imageUrl: !!imageUrl, description: !!description });
            
            return { 
                title: title || 'Unknown Song', 
                url, 
                imageUrl,
                description: description || 'Fresh beats from Suno AI!'
            };
        } catch (error) {
            console.error('❌ Error extracting Suno data:', error);
            return { title: 'Unknown Song', url, imageUrl: null, description: 'Fresh beats from Suno AI!' };
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
            
            // Extract artwork data (still try to get images)
            const songData = await this.extractSunoData(url);
            
            // Use manual title instead of extracted title
            const finalTitle = title || songData.title || 'Unknown Song';
            const finalDescription = description || songData.description || 'Fresh beats from Suno AI!';
            
            // Create premium embed with beautiful formatting
            const embed = new EmbedBuilder()
                .setAuthor({ 
                    name: '🎵 Suno AI Music', 
                    iconURL: 'https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld' 
                })
                .setTitle(`🔥 ${finalTitle}`)
                .setURL(url)
                .setColor(0x7C3AED) // Premium purple color
                .setTimestamp()
                .setFooter({ 
                    text: '3AM VERIFIED • Premium Suno Bot' 
                });

            // Add beautiful description
            embed.setDescription(`🎶 **${finalDescription}**\n\n🔗 [Listen on Suno](${url})`);

            // Add large artwork - use default if no image found
            if (songData.imageUrl) {
                embed.setImage(songData.imageUrl);
                embed.setThumbnail(songData.imageUrl);
            } else {
                // Use a beautiful default Suno music artwork
                const defaultArtwork = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop&crop=center';
                embed.setImage(defaultArtwork);
                embed.setThumbnail('https://images.crunchbase.com/image/upload/c_lpad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/erkxwhl1gd48xfhe2yld');
            }

            // Add premium fields
            embed.addFields([
                { 
                    name: '🎤 Song Title', 
                    value: finalTitle, 
                    inline: false 
                },
                { 
                    name: '🌟 Status', 
                    value: '✅ Manually Posted via Dashboard', 
                    inline: true 
                },
                { 
                    name: '⚡ Source', 
                    value: '3AM VERIFIED Bot', 
                    inline: true 
                }
            ]);

            // Send with reactions
            const message = await channel.send({ embeds: [embed] });
            
            // Add premium reactions
            await message.react('🔥');
            await message.react('💎');
            await message.react('🎯');
            
            console.log(`✅ Posted premium Suno song to Discord: ${finalTitle}`);
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

        .discord-button {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, #5865f2, #7289da);
            color: white;
            border: none;
            padding: 15px 25px;
            border-radius: 50px;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 8px 25px rgba(88, 101, 242, 0.4);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            animation: discordPulse 3s ease-in-out infinite;
        }

        .discord-button:hover {
            transform: translateY(-3px) scale(1.05);
            box-shadow: 0 12px 35px rgba(88, 101, 242, 0.6);
        }

        @keyframes discordPulse {
            0%, 100% { box-shadow: 0 8px 25px rgba(88, 101, 242, 0.4); }
            50% { box-shadow: 0 8px 35px rgba(88, 101, 242, 0.8); }
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
        <!-- Discord Join Button -->
        <a href="https://discord.gg/your-invite-link" target="_blank" class="discord-button">
            <svg width="24" height="24" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g clip-path="url(#clip0)">
                    <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
                </g>
                <defs>
                    <clipPath id="clip0">
                        <rect width="71" height="55" fill="white"/>
                    </clipPath>
                </defs>
            </svg>
            Join Discord
        </a>

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

            <!-- Live Music -->
            <div class="section">
                <h2>🎵 Live Music Stream</h2>
                <div class="stats-grid">
                    <div class="stat-card" style="background: linear-gradient(135deg, rgba(244, 63, 94, 0.2), rgba(139, 69, 19, 0.2)); border: 2px solid rgba(244, 63, 94, 0.4);">
                        <h3 id="musicStatus" style="color: #f43f5e;">🎶 Now Playing</h3>
                        <p><strong>Artist:</strong> <span id="currentArtist">Listening for music...</span></p>
                        <p><strong>Song:</strong> <span id="currentSong">Waiting for track info...</span></p>
                        <p><strong>Source:</strong> <span id="musicSource">Music Video Channel</span></p>
                        <p><strong>Status:</strong> <span id="liveStatus">🔴 Live</span></p>
                        
                        <!-- Embedded Spotify Player -->
                        <div id="spotifyPlayer" style="margin: 20px 0; display: none;">
                            <iframe id="spotifyEmbed" style="border-radius:12px" src="" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
                        </div>
                        
                        <div style="margin-top: 20px; display: flex; justify-content: center; gap: 15px;">
                            <button onclick="refreshNowPlaying()" class="btn" style="background: #4ecdc4; padding: 12px 24px; font-size: 16px;">
                                🔄 Refresh
                            </button>
                            <button onclick="openSpotify()" class="btn" style="background: #1db954; padding: 12px 24px; font-size: 16px;">
                                🎵 Open in Spotify
                            </button>
                        </div>
                    </div>
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
                <h2>🎵 Auto-Post Suno Song</h2>
                <form id="sunoForm">
                    <div class="form-group">
                        <label>Suno Song URL</label>
                        <input type="text" id="sunoUrl" placeholder="https://suno.com/song/..." required>
                    </div>
                    <button type="submit" class="btn">🤖 Auto-Post with Smart Detection</button>
                </form>
                <div id="sunoStatus" style="margin-top: 15px;"></div>
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; margin-top: 15px; border: 1px solid rgba(255,255,255,0.2);">
                    <h4 style="margin-top: 0; color: #4ade80;">🤖 Smart Auto-Detection</h4>
                    <p style="margin-bottom: 0; opacity: 0.9;">Your bot automatically extracts the real song title and artwork from Suno URLs using advanced detection technology. No manual input needed!</p>
                </div>
            </div>

            <!-- Suno Profile Monitoring -->
            <div class="section">
                <h2>👥 Suno Profile Monitoring</h2>
                <div class="admin-controls" style="margin-bottom: 30px;">
                    <button onclick="testMonitoring()" class="btn" style="background: linear-gradient(135deg, #667eea, #764ba2);">🔍 Test Monitoring</button>
                    <button onclick="checkNow()" class="btn" style="background: linear-gradient(135deg, #4ecdc4, #44a08d);">⚡ Check Now</button>
                </div>
                <div class="grid">
                    ${this.sunoProfiles.map((profile, index) => `
                        <div class="profile-card">
                            <h4>${profile.name}</h4>
                            <p><strong>Profile ID:</strong> ${profile.id}</p>
                            <p><strong>Last Checked:</strong> ${profile.lastChecked.toLocaleTimeString()}</p>
                            <p><strong>Status:</strong> <span style="color: #4ecdc4;">✅ Active</span></p>
                            <div style="margin-top: 15px;">
                                <button onclick="removeProfile(${index})" class="btn" style="background: #ff6b6b; padding: 8px 16px;">🗑️ Remove</button>
                            </div>
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
                                    <div style="margin-top: 15px; display: flex; gap: 10px;">
                                        <button onclick="approveProfile(${index})" class="btn" style="background: #4ecdc4; padding: 8px 16px;">✅ Approve</button>
                                        <button onclick="denyProfile(${index})" class="btn" style="background: #ff6b6b; padding: 8px 16px;">❌ Deny</button>
                                    </div>
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

            // Admin functions for profile management
            async function approveProfile(index) {
                try {
                    const response = await fetch('/approve-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ index })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        alert('✅ Profile approved and added to monitoring!');
                        window.location.reload();
                    } else {
                        alert('❌ Failed to approve profile: ' + result.error);
                    }
                } catch (error) {
                    alert('❌ Error approving profile: ' + error.message);
                }
            }
            
            async function denyProfile(index) {
                try {
                    const response = await fetch('/deny-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ index })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        alert('❌ Profile request denied and removed');
                        window.location.reload();
                    } else {
                        alert('❌ Failed to deny profile: ' + result.error);
                    }
                } catch (error) {
                    alert('❌ Error denying profile: ' + error.message);
                }
            }

            async function removeProfile(index) {
                if (confirm('Are you sure you want to remove this profile from monitoring?')) {
                    try {
                        const response = await fetch('/remove-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ index })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            alert('🗑️ Profile removed from monitoring!');
                            window.location.reload();
                        } else {
                            alert('❌ Failed to remove profile: ' + result.error);
                        }
                    } catch (error) {
                        alert('❌ Error removing profile: ' + error.message);
                    }
                }
            }

            // Live Music Functions
            let isMuted = false;
            
            function toggleMute() {
                const muteButton = document.getElementById('muteToggle');
                isMuted = !isMuted;
                
                if (isMuted) {
                    muteButton.innerHTML = '🔇 Unmute Stream';
                    muteButton.style.background = '#6b7280';
                    document.getElementById('liveStatus').innerHTML = '🔇 Muted';
                } else {
                    muteButton.innerHTML = '🔊 Mute Stream';
                    muteButton.style.background = '#f43f5e';
                    document.getElementById('liveStatus').innerHTML = '🔴 Live';
                }
            }
            
            let currentSpotifyUrl = '';
            
            async function refreshNowPlaying() {
                try {
                    const response = await fetch('/now-playing');
                    const data = await response.json();
                    
                    if (data.success) {
                        document.getElementById('currentArtist').textContent = data.artist || 'Unknown Artist';
                        document.getElementById('currentSong').textContent = data.song || 'Unknown Song';
                        document.getElementById('musicSource').textContent = data.source || 'Music Video Channel';
                        document.getElementById('musicStatus').innerHTML = '🎶 Now Playing';
                        
                        // Show Spotify player if URL is available
                        if (data.spotifyUrl) {
                            currentSpotifyUrl = data.spotifyUrl;
                            const trackId = extractSpotifyTrackId(data.spotifyUrl);
                            if (trackId) {
                                const embedUrl = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
                                document.getElementById('spotifyEmbed').src = embedUrl;
                                document.getElementById('spotifyPlayer').style.display = 'block';
                            }
                        }
                    } else {
                        document.getElementById('currentArtist').textContent = 'Listening for music...';
                        document.getElementById('currentSong').textContent = 'Waiting for track info...';
                        document.getElementById('musicStatus').innerHTML = '🔍 Searching...';
                    }
                } catch (error) {
                    console.log('Could not fetch now playing info');
                }
            }
            
            function extractSpotifyTrackId(url) {
                const match = url.match(/track\/([a-zA-Z0-9]+)/);
                return match ? match[1] : null;
            }
            
            function openSpotify() {
                if (currentSpotifyUrl) {
                    window.open(currentSpotifyUrl, '_blank');
                } else {
                    alert('No Spotify track available!');
                }
            }
            
            // Auto-refresh now playing every 15 seconds for faster updates
            setInterval(refreshNowPlaying, 15000);

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



            // Suno form submission with enhanced error handling
            document.addEventListener('DOMContentLoaded', function() {
                const sunoForm = document.getElementById('sunoForm');
                if (sunoForm) {
                    sunoForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const status = document.getElementById('sunoStatus');
                        const submitBtn = e.target.querySelector('button[type="submit"]');
                        const urlInput = document.getElementById('sunoUrl');
                        
                        // Disable submit button during processing
                        submitBtn.disabled = true;
                        submitBtn.textContent = '🔄 Posting...';
                        status.innerHTML = '<p style="color: #4ecdc4;">🔄 Posting song to Discord...</p>';
                        
                        try {
                            const sunoUrl = urlInput.value.trim();
                            
                            if (!sunoUrl) {
                                throw new Error('Please enter a Suno URL');
                            }
                            
                            console.log('Auto-posting Suno URL:', sunoUrl);
                            
                            const response = await fetch('/auto-post-suno', {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                },
                                body: JSON.stringify({
                                    sunoUrl: sunoUrl
                                })
                            });
                            
                            if (!response.ok) {
                                throw new Error(\`Server error: \${response.status}\`);
                            }
                            
                            const result = await response.json();
                            console.log('Server response:', result);
                            
                            if (result.success) {
                                status.innerHTML = '<div style="color: #4ecdc4; padding: 15px; background: rgba(78, 205, 196, 0.1); border-radius: 8px; border: 1px solid rgba(78, 205, 196, 0.3);">✅ Song auto-posted with smart detection!<br><strong>URL:</strong> <a href="' + result.url + '" target="_blank" style="color: #4ecdc4;">' + result.url + '</a><br><small>🤖 Bot will automatically extract title and artwork</small></div>';
                                sunoForm.reset();
                            } else {
                                status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + (result.error || 'Unknown error') + '</p>';
                            }
                        } catch (error) {
                            console.error('Form submission error:', error);
                            status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to post song: ' + error.message + '</p>';
                        } finally {
                            // Re-enable submit button
                            submitBtn.disabled = false;
                            submitBtn.textContent = '🤖 Auto-Post with Smart Detection';
                        }
                        
                        return false;
                    });
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