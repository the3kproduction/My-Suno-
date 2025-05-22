const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const SunoService = require('./services/sunoService');
const Storage = require('./utils/storage');
const logger = require('./utils/logger');

class SunoTriggerBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });
        
        this.discordService = new DiscordService(this.client);
        this.sunoService = new SunoService();
        this.storage = new Storage();
        this.app = express();
        this.isReady = false;
    }

    async start() {
        try {
            // Initialize storage
            await this.storage.init();
            
            // Login to Discord
            await this.client.login(config.discord.token);
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Set up web server
            this.setupWebServer();
            
            logger.info('Suno Trigger Bot started successfully');
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
    }

    setupWebServer() {
        this.app.use(express.static('public'));
        
        // Trigger endpoint - you'll visit this URL after uploading new songs
        this.app.get('/trigger', async (req, res) => {
            try {
                if (!this.isReady) {
                    return res.status(503).send(`
                        <html>
                            <body style="font-family: Arial; text-align: center; padding: 50px;">
                                <h2>🤖 Bot is starting up...</h2>
                                <p>Please wait a moment and try again.</p>
                                <button onclick="window.location.reload()">Refresh</button>
                            </body>
                        </html>
                    `);
                }

                logger.info('Manual trigger activated - checking for new songs');
                const result = await this.checkForNewSongs();
                
                const html = `
                    <html>
                        <body style="font-family: Arial; text-align: center; padding: 50px;">
                            <h2>🎵 Song Check Complete!</h2>
                            <div style="background: #f0f0f0; padding: 20px; border-radius: 10px; margin: 20px 0;">
                                ${result.message}
                            </div>
                            <p><strong>Songs found:</strong> ${result.songsFound}</p>
                            <p><strong>New songs posted:</strong> ${result.newSongs}</p>
                            <button onclick="window.location.reload()" style="padding: 10px 20px; font-size: 16px;">Check Again</button>
                        </body>
                    </html>
                `;
                
                res.send(html);
            } catch (error) {
                logger.error('Error in trigger endpoint:', error);
                res.status(500).send(`
                    <html>
                        <body style="font-family: Arial; text-align: center; padding: 50px;">
                            <h2>❌ Error</h2>
                            <p>Something went wrong: ${error.message}</p>
                            <button onclick="window.location.reload()">Try Again</button>
                        </body>
                    </html>
                `);
            }
        });

        // Status page
        this.app.get('/', (req, res) => {
            const stats = this.storage.getStats();
            res.send(`
                <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>🎵 Suno Discord Bot</h1>
                        <p>Bot Status: ${this.isReady ? '✅ Ready' : '⏳ Starting...'}</p>
                        <p>Total songs posted: ${stats.totalPostedSongs}</p>
                        <div style="margin: 30px 0;">
                            <a href="/trigger" style="background: #5865F2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px;">
                                🚀 Check for New Songs
                            </a>
                        </div>
                        <p style="color: #666;">Visit the trigger link after you upload new songs to Suno!</p>
                    </body>
                </html>
            `);
        });

        const port = 5000;
        this.app.listen(port, '0.0.0.0', () => {
            logger.info(`Trigger server running on port ${port}`);
            logger.info(`Visit the trigger URL after uploading new songs!`);
        });
    }

    async checkForNewSongs() {
        try {
            // For manual trigger, we'll try to get songs from your public profile
            // Since API isn't working, we'll create a placeholder that you can extend
            
            logger.info('Checking for new songs...');
            
            // This is where you could manually input song data or we could
            // try different approaches to get your latest songs
            const mockSong = {
                id: `manual_${Date.now()}`,
                title: 'Test Song - Manual Trigger',
                description: 'This is a test of the manual trigger system',
                audio_url: 'https://suno.com/@3kloudz',
                created_at: new Date().toISOString()
            };

            // Check if this would be a new song
            const isAlreadyPosted = await this.storage.isAlreadyPosted(mockSong.id);
            
            if (!isAlreadyPosted) {
                // Post to Discord
                await this.discordService.postSong(config.discord.channelId, mockSong);
                await this.storage.addPostedSong(mockSong);
                
                return {
                    message: 'Successfully posted new song to Discord!',
                    songsFound: 1,
                    newSongs: 1
                };
            } else {
                return {
                    message: 'No new songs found to post.',
                    songsFound: 1,
                    newSongs: 0
                };
            }

        } catch (error) {
            logger.error('Error checking for new songs:', error);
            throw error;
        }
    }
}

// Start the bot
const bot = new SunoTriggerBot();
bot.start().catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});