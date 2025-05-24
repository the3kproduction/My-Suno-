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
        // Serve the exact working dashboard
        this.app.get('/', (req, res) => {
            const fs = require('fs');
            const htmlContent = fs.readFileSync('working_reference.html', 'utf8');
            res.send(htmlContent);
        });

        // Working now-playing endpoint that matches reference site
        this.app.get('/now-playing', async (req, res) => {
            try {
                // Try to get music info from Discord
                const musicVideoChannelId = '1375615201990283303';
                const musicVideoChannel = this.client.channels.cache.get(musicVideoChannelId);
                
                if (!musicVideoChannel) {
                    return res.json({
                        success: false,
                        artist: "Error fetching info",
                        song: "Please check connection",
                        source: "New Songs Channel"
                    });
                }

                // Look for FlaviBot presence
                const guild = musicVideoChannel.guild;
                const flaviBot = guild.members.cache.find(member => 
                    member.user.username.toLowerCase().includes('flavi') || 
                    member.user.displayName.toLowerCase().includes('flavi')
                );

                if (flaviBot && flaviBot.presence && flaviBot.presence.activities.length > 0) {
                    const activity = flaviBot.presence.activities.find(act => 
                        act.type === 2 || // LISTENING
                        act.name.toLowerCase().includes('music') ||
                        act.name.toLowerCase().includes('spotify')
                    );

                    if (activity) {
                        return res.json({
                            success: true,
                            artist: activity.state || "Unknown Artist",
                            song: activity.details || "Unknown Song",
                            source: "FlaviBot Player"
                        });
                    }
                }

                return res.json({
                    success: false,
                    artist: "No music playing",
                    song: "Waiting for track...",
                    source: "Music Channel"
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