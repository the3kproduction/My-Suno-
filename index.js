const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const SunoService = require('./services/sunoService');
const Storage = require('./utils/storage');
const logger = require('./utils/logger');

class SunoDiscordBot {
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
        this.isRunning = false;
    }

    async start() {
        try {
            // Initialize storage
            await this.storage.init();
            
            // Login to Discord
            await this.client.login(config.discord.token);
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Start monitoring
            this.startMonitoring();
            
            logger.info('Suno Discord Bot started successfully');
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            logger.info(`Bot logged in as ${this.client.user.tag}`);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            logger.info('Received SIGINT, shutting down gracefully...');
            this.stop();
        });

        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM, shutting down gracefully...');
            this.stop();
        });
    }

    startMonitoring() {
        if (this.isRunning) {
            logger.warn('Monitoring is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting Suno profile monitoring...');
        
        // Initial check
        this.checkForNewSongs();
        
        // Set up interval for every 5 minutes (300000 ms)
        this.monitoringInterval = setInterval(() => {
            this.checkForNewSongs();
        }, config.monitoring.interval);
    }

    async checkForNewSongs() {
        try {
            logger.info('Checking for new songs...');
            
            // Get latest songs from Suno
            const latestSongs = await this.sunoService.getLatestSongs(config.suno.profileId);
            
            if (!latestSongs || latestSongs.length === 0) {
                logger.info('No songs found in profile');
                return;
            }

            // Get previously posted songs
            const postedSongs = await this.storage.getPostedSongs();
            
            // Filter out already posted songs
            const newSongs = latestSongs.filter(song => 
                !postedSongs.some(posted => posted.id === song.id)
            );

            if (newSongs.length === 0) {
                logger.info('No new songs to post');
                return;
            }

            logger.info(`Found ${newSongs.length} new song(s)`);

            // Post new songs to Discord
            for (const song of newSongs) {
                try {
                    await this.discordService.postSong(config.discord.channelId, song);
                    await this.storage.addPostedSong(song);
                    logger.info(`Posted new song: ${song.title}`);
                } catch (error) {
                    logger.error(`Failed to post song ${song.title}:`, error);
                }
            }

        } catch (error) {
            logger.error('Error checking for new songs:', error);
        }
    }

    stop() {
        this.isRunning = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.client) {
            this.client.destroy();
        }

        logger.info('Bot stopped');
        process.exit(0);
    }
}

// Start the bot
const bot = new SunoDiscordBot();
bot.start().catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});
