const express = require('express');
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const Storage = require('./utils/storage');
const logger = require('./utils/logger');

class ManualSunoBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });
        
        this.discordService = new DiscordService(this.client);
        this.storage = new Storage();
        this.app = express();
        this.isReady = false;
        
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
    }

    async start() {
        try {
            await this.storage.init();
            await this.client.login(config.discord.token);
            this.setupEventHandlers();
            this.setupWebServer();
            
            logger.info('Manual Suno Bot started successfully');
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            logger.info(`Bot logged in as ${this.client.user.tag}`);
            this.isReady = true;
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
        });

        // Simple command to get the posting link
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            
            // Respond to !post or !suno commands
            if (message.content.toLowerCase() === '!post' || message.content.toLowerCase() === '!suno') {
                const embed = {
                    color: 0x5865F2,
                    title: '🎵 Post New Suno Song',
                    description: 'Click the link below to post your latest Suno song to this channel!',
                    fields: [
                        {
                            name: '📝 How to use:',
                            value: '1. Create your song on Suno\n2. Click the link below\n3. Fill in song title and URL\n4. Hit "Post to Discord" - done! 🎉'
                        }
                    ],
                    footer: {
                        text: 'Your songs will appear here automatically!'
                    }
                };

                // Get the current domain (this will be your Replit app URL)
                const domain = process.env.REPLIT_DOMAIN || 'your-replit-app';
                const postUrl = `https://${domain}.replit.app/`;

                await message.reply({ 
                    content: `🚀 **Post your Suno song here:** ${postUrl}`,
                    embeds: [embed]
                });
            }
        });
    }

    setupWebServer() {
        // Main form page
        this.app.get('/', (req, res) => {
            const stats = this.storage.getStats();
            res.send(`
                <html>
                    <head>
                        <title>🎵 Suno Discord Bot</title>
                        <style>
                            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                            .form-group { margin: 20px 0; }
                            label { display: block; margin-bottom: 5px; font-weight: bold; }
                            input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
                            button { background: #5865F2; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
                            button:hover { background: #4752C4; }
                            .status { text-align: center; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <h1>🎵 Post New Suno Song to Discord</h1>
                        
                        <div class="status">
                            <p>Bot Status: ${this.isReady ? '✅ Ready' : '⏳ Starting...'}</p>
                            <p>Total songs posted: ${stats.totalPostedSongs}</p>
                        </div>

                        <form action="/post-song" method="POST">
                            <div class="form-group">
                                <label for="title">Song Title *</label>
                                <input type="text" id="title" name="title" required placeholder="Enter your song title">
                            </div>
                            
                            <div class="form-group">
                                <label for="url">Song URL *</label>
                                <input type="url" id="url" name="url" required placeholder="https://suno.com/song/your-song-id">
                            </div>
                            
                            <div class="form-group">
                                <label for="description">Description (optional)</label>
                                <textarea id="description" name="description" placeholder="Brief description of your song" rows="3"></textarea>
                            </div>
                            
                            <button type="submit">🚀 Post to Discord</button>
                        </form>

                        <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 10px;">
                            <h3>How to use:</h3>
                            <ol>
                                <li>Create a new song on Suno</li>
                                <li>Copy the song title and URL</li>
                                <li>Fill out this form</li>
                                <li>Click "Post to Discord" - done! 🎉</li>
                            </ol>
                        </div>
                    </body>
                </html>
            `);
        });

        // Handle automatic song posting with URL scraping
        this.app.post('/post-song-auto', async (req, res) => {
            try {
                const { url } = req.body;
                
                if (!url) {
                    return res.send(this.errorPage('Please provide a Suno URL'));
                }

                // Scrape title from Suno URL
                const title = await this.scrapeSongTitle(url);
                if (!title) {
                    return res.send(this.errorPage('Could not extract song title from URL. Please use manual posting.'));
                }

                const songId = this.generateSongId(url);
                
                if (await this.storage.isAlreadyPosted(songId)) {
                    return res.send(this.errorPage('This song has already been posted to Discord'));
                }

                const song = {
                    id: songId,
                    title: title,
                    url: url,
                    created_at: new Date().toISOString()
                };

                await this.discordService.postSong(config.discord.channelId, song);
                await this.storage.addPostedSong(song);

                res.send(this.successPage(title, `🎵 "${title}" posted to Discord successfully!`, 'success'));
                
            } catch (error) {
                logger.error('Error posting song automatically:', error);
                res.send(this.errorPage('Failed to post song. Please try again.'));
            }
        });

        // Handle song posting
        this.app.post('/post-song', async (req, res) => {
            try {
                if (!this.isReady) {
                    return res.status(503).send(this.errorPage('Bot is starting up, please wait a moment and try again.'));
                }

                const { title, url, description } = req.body;

                if (!title || !url) {
                    return res.status(400).send(this.errorPage('Please provide both song title and URL.'));
                }

                // Create song object
                const song = {
                    id: this.generateSongId(url),
                    title: title.trim(),
                    description: description ? description.trim() : '',
                    audio_url: url.trim(),
                    url: url.trim(),
                    created_at: new Date().toISOString()
                };

                // Check if already posted
                const isAlreadyPosted = await this.storage.isAlreadyPosted(song.id);
                
                if (isAlreadyPosted) {
                    return res.send(this.successPage(
                        'Song Already Posted',
                        'This song has already been posted to Discord.',
                        'warning'
                    ));
                }

                // Post to Discord (use correct channel ID)
                const channelId = '1375178931312787457'; // Fixed channel ID
                await this.discordService.postSong(channelId, song);
                await this.storage.addPostedSong(song);

                logger.info(`Successfully posted song: ${song.title}`);

                res.send(this.successPage(
                    'Success! 🎉',
                    `Your song "${song.title}" has been posted to Discord!`,
                    'success'
                ));

            } catch (error) {
                logger.error('Error posting song:', error);
                res.status(500).send(this.errorPage(`Error posting song: ${error.message}`));
            }
        });

        const port = 5000;
        this.app.listen(port, '0.0.0.0', () => {
            logger.info(`Manual trigger server running on port ${port}`);
        });
    }

    generateSongId(url) {
        // Extract unique ID from Suno URL or create one based on URL
        const match = url.match(/\/song\/([^\/\?]+)/);
        return match ? match[1] : `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    successPage(title, message, type = 'success') {
        const color = type === 'success' ? '#28a745' : '#ffc107';
        const emoji = type === 'success' ? '🎉' : '⚠️';
        
        return `
            <html>
                <head>
                    <title>${title}</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                        .message { background: ${color}; color: white; padding: 30px; border-radius: 10px; margin: 20px 0; }
                        button { background: #5865F2; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin: 10px; }
                        button:hover { background: #4752C4; }
                    </style>
                </head>
                <body>
                    <div class="message">
                        <h2>${emoji} ${title}</h2>
                        <p>${message}</p>
                    </div>
                    <button onclick="window.location.href='/'">Post Another Song</button>
                </body>
            </html>
        `;
    }

    errorPage(message) {
        return this.successPage('Error', message, 'error');
    }
}

// Start the bot
const bot = new ManualSunoBot();
bot.start().catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});