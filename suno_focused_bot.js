const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

class SunoFocusedBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions]
        });
        
        this.postedSongs = new Set();
        this.songStats = new Map();
        this.profiles = [process.env.SUNO_PROFILE_ID]; // Support multiple profiles
        this.app = express();
        this.setupWebServer();
        this.setupSlashCommands();
    }

    async start() {
        console.log('🎵 Starting premium Suno Discord bot...');
        
        this.client.once('ready', async () => {
            console.log(`🎵 Bot logged in as ${this.client.user.tag}`);
            await this.registerSlashCommands();
            this.startProfileMonitoring();
            this.setupEventHandlers();
        });

        await this.client.login(process.env.DISCORD_TOKEN);
    }

    async setupSlashCommands() {
        this.commands = [
            {
                name: 'suno-stats',
                description: 'Show statistics for posted Suno songs'
            },
            {
                name: 'add-profile',
                description: 'Add a Suno profile to monitor',
                options: [{
                    name: 'profile_id',
                    description: 'Suno profile ID to monitor',
                    type: 3,
                    required: true
                }]
            },
            {
                name: 'force-check',
                description: 'Manually check for new songs right now'
            },
            {
                name: 'top-songs',
                description: 'Show most popular posted songs'
            }
        ];
    }

    async registerSlashCommands() {
        try {
            console.log('🔄 Registering premium slash commands...');
            const guild = this.client.guilds.cache.first();
            if (guild) {
                await guild.commands.set(this.commands);
                console.log('✅ Premium slash commands registered!');
            }
        } catch (error) {
            console.error('❌ Error registering commands:', error);
        }
    }

    setupEventHandlers() {
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            try {
                switch (interaction.commandName) {
                    case 'suno-stats':
                        await this.handleStatsCommand(interaction);
                        break;
                    case 'add-profile':
                        await this.handleAddProfileCommand(interaction);
                        break;
                    case 'force-check':
                        await this.handleForceCheckCommand(interaction);
                        break;
                    case 'top-songs':
                        await this.handleTopSongsCommand(interaction);
                        break;
                }
            } catch (error) {
                console.error('❌ Command error:', error);
                if (!interaction.replied) {
                    await interaction.reply('❌ Something went wrong processing your command.');
                }
            }
        });

        // Add reaction tracking for song popularity
        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot) return;
            
            const message = reaction.message;
            if (message.embeds.length > 0 && message.embeds[0].title?.includes('New Suno Song')) {
                const songTitle = message.embeds[0].title.replace('🎵 New Suno Song: ', '');
                if (!this.songStats.has(songTitle)) {
                    this.songStats.set(songTitle, { likes: 0, shares: 0, comments: 0 });
                }
                this.songStats.get(songTitle).likes++;
            }
        });
    }

    startProfileMonitoring() {
        console.log('🔍 Starting premium Suno profile monitoring...');
        setInterval(() => {
            this.checkAllProfiles();
        }, 3 * 60 * 1000); // Check every 3 minutes for premium experience

        // Check immediately on start
        setTimeout(() => this.checkAllProfiles(), 5000);
    }

    async checkAllProfiles() {
        for (const profileId of this.profiles) {
            await this.checkForNewSongs(profileId);
        }
    }

    async handleStatsCommand(interaction) {
        await interaction.deferReply();
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('📊 3AM VERIFIED Suno Bot Statistics')
            .addFields([
                { name: '🎵 Total Songs Posted', value: this.postedSongs.size.toString(), inline: true },
                { name: '👥 Monitored Profiles', value: this.profiles.length.toString(), inline: true },
                { name: '📈 Active Since', value: 'Bot Start', inline: true }
            ])
            .setFooter({ text: '3AM VERIFIED Premium Bot' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    async handleAddProfileCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const profileId = interaction.options.getString('profile_id');
        
        if (this.profiles.includes(profileId)) {
            await interaction.editReply('❌ This profile is already being monitored!');
            return;
        }

        this.profiles.push(profileId);
        await interaction.editReply(`✅ Added Suno profile ${profileId} to monitoring list!`);
        
        // Immediately check the new profile
        setTimeout(() => this.checkForNewSongs(profileId), 2000);
    }

    async handleForceCheckCommand(interaction) {
        await interaction.deferReply();
        
        await interaction.editReply('🔍 Manually checking all profiles for new songs...');
        await this.checkAllProfiles();
        
        await interaction.editReply('✅ Manual check completed! New songs will appear in the channel if found.');
    }

    async handleTopSongsCommand(interaction) {
        await interaction.deferReply();
        
        const topSongs = Array.from(this.songStats.entries())
            .sort((a, b) => b[1].likes - a[1].likes)
            .slice(0, 10);

        if (topSongs.length === 0) {
            await interaction.editReply('📊 No song statistics available yet. Songs will be tracked as they receive reactions!');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle('🏆 Top Suno Songs by Popularity')
            .setDescription(topSongs.map((song, i) => 
                `${i + 1}. **${song[0]}** - ${song[1].likes} reactions`
            ).join('\n'))
            .setFooter({ text: '3AM VERIFIED Premium Analytics' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    async checkForNewSongs(profileId) {
        try {
            console.log(`🔍 Checking Suno profile: ${profileId}`);
            
            const response = await axios.get(`https://studio-api.suno.ai/api/external/clips/?user_id=${profileId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });

            const songs = response.data || [];
            let newSongsFound = 0;
            
            for (const song of songs.slice(0, 10)) { // Check latest 10 songs
                if (!this.postedSongs.has(song.id) && song.status === 'complete') {
                    await this.postSunoToDiscord(song, profileId);
                    this.postedSongs.add(song.id);
                    newSongsFound++;
                }
            }
            
            if (newSongsFound > 0) {
                console.log(`✅ Posted ${newSongsFound} new songs from profile ${profileId}`);
            }
            
        } catch (error) {
            console.log(`❌ Error checking profile ${profileId}:`, error.message);
        }
    }

    async postSunoToDiscord(song, profileId) {
        try {
            const channel = await this.client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
            
            // Premium embed with enhanced features
            const embed = new EmbedBuilder()
                .setColor(0x7C3AED)
                .setTitle(`🎵 NEW SUNO DROP: ${song.title}`)
                .setDescription(`🔥 **${song.metadata?.prompt || 'Fresh beats incoming!'}**`)
                .addFields([
                    { name: '🎤 Style/Genre', value: song.metadata?.tags || 'Surprise Style', inline: true },
                    { name: '⏱️ Duration', value: `${Math.floor(song.metadata?.duration_seconds / 60)}:${(song.metadata?.duration_seconds % 60).toString().padStart(2, '0')}` || 'Unknown', inline: true },
                    { name: '👤 Artist Profile', value: profileId, inline: true },
                    { name: '🔗 Direct Link', value: `[🎧 Listen on Suno](https://suno.com/song/${song.id})`, inline: false }
                ])
                .setFooter({ text: '3AM VERIFIED Premium • React to show love!' })
                .setTimestamp();

            if (song.image_url) {
                embed.setImage(song.image_url); // Use larger image instead of thumbnail
            }

            // Add premium reactions for engagement
            const message = await channel.send({ embeds: [embed] });
            
            // Auto-add reaction options
            await message.react('🔥');
            await message.react('💎');
            await message.react('🎯');
            
            // Initialize song stats
            this.songStats.set(song.title, { likes: 0, shares: 0, comments: 0, posted: new Date() });
            
            console.log(`✅ Posted premium Suno song: ${song.title}`);
            
        } catch (error) {
            console.error('❌ Error posting to Discord:', error);
        }
    }

    setupWebServer() {
        this.app.use(express.static('.'));
        
        this.app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>3AM VERIFIED Suno Bot</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            font-family: 'Arial', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                        }
                        
                        .container {
                            text-align: center;
                            padding: 2rem;
                            background: rgba(0, 0, 0, 0.3);
                            border-radius: 20px;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                            backdrop-filter: blur(10px);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                        }
                        
                        .logo {
                            width: 150px;
                            height: 150px;
                            margin: 0 auto 2rem;
                            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 3rem;
                            font-weight: bold;
                            animation: pulse 2s infinite;
                        }
                        
                        @keyframes pulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                            100% { transform: scale(1); }
                        }
                        
                        h1 {
                            font-size: 3rem;
                            margin-bottom: 1rem;
                            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            background-clip: text;
                        }
                        
                        .status {
                            font-size: 1.5rem;
                            margin: 2rem 0;
                            padding: 1rem;
                            background: rgba(0, 255, 0, 0.2);
                            border-radius: 10px;
                            border: 1px solid rgba(0, 255, 0, 0.3);
                        }
                        
                        .feature {
                            background: rgba(255, 255, 255, 0.1);
                            margin: 1rem 0;
                            padding: 1rem;
                            border-radius: 10px;
                            border-left: 4px solid #4ecdc4;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="logo">3AM</div>
                        <h1>VERIFIED Suno Bot</h1>
                        <div class="status">🎵 Bot is monitoring Suno profile for new songs!</div>
                        
                        <div class="feature">
                            <h3>🎤 Auto Suno Posting</h3>
                            <p>Automatically posts new songs from monitored Suno profiles to Discord</p>
                        </div>
                        
                        <div class="feature">
                            <h3>🎨 Rich Embeds</h3>
                            <p>Beautiful song cards with artwork, duration, and style information</p>
                        </div>
                        
                        <div class="feature">
                            <h3>⚡ Real-time Monitoring</h3>
                            <p>Checks for new songs every 3 minutes and posts instantly</p>
                        </div>
                        
                        <div class="feature">
                            <h3>🎬 Latest Suno Preview</h3>
                            <div id="suno-preview" style="margin: 1rem 0;">
                                <iframe 
                                    width="320" 
                                    height="180" 
                                    src="https://suno.com/song/3kloudz/embed" 
                                    frameborder="0" 
                                    style="border-radius: 10px; background: rgba(0,0,0,0.3);">
                                </iframe>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 2rem 0;">
                            <div style="background: rgba(0,255,0,0.2); padding: 1rem; border-radius: 10px; text-align: center;">
                                <h3>🎵 Songs Posted</h3>
                                <div style="font-size: 2rem; font-weight: bold;">${this.postedSongs.size}</div>
                            </div>
                            <div style="background: rgba(255,100,100,0.2); padding: 1rem; border-radius: 10px; text-align: center;">
                                <h3>👥 Profiles</h3>
                                <div style="font-size: 2rem; font-weight: bold;">${this.profiles.length}</div>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        this.app.listen(5000, () => {
            console.log('🌟 Web server running on port 5000');
        });
    }
}

const bot = new SunoFocusedBot();
bot.start().catch(console.error);