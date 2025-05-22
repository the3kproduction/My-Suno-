const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('./logger');

class Storage {
    constructor() {
        this.filePath = config.storage.filePath;
        this.data = {
            postedSongs: []
        };
    }

    async init() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });

            // Try to load existing data
            await this.load();
            
            logger.info(`Storage initialized with ${this.data.postedSongs.length} previously posted songs`);
        } catch (error) {
            logger.error('Failed to initialize storage:', error);
            throw error;
        }
    }

    async load() {
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            this.data = JSON.parse(data);
            
            // Ensure data structure
            if (!this.data.postedSongs) {
                this.data.postedSongs = [];
            }
            
            logger.debug(`Loaded ${this.data.postedSongs.length} posted songs from storage`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create with default data
                logger.info('Storage file not found, creating new one');
                await this.save();
            } else {
                logger.error('Failed to load storage:', error);
                // Continue with empty data
                this.data = { postedSongs: [] };
            }
        }
    }

    async save() {
        try {
            const dataString = JSON.stringify(this.data, null, 2);
            await fs.writeFile(this.filePath, dataString, 'utf8');
            logger.debug('Storage saved successfully');
        } catch (error) {
            logger.error('Failed to save storage:', error);
            throw error;
        }
    }

    async getPostedSongs() {
        return [...this.data.postedSongs];
    }

    async addPostedSong(song) {
        try {
            const postedSong = {
                id: song.id,
                title: song.title,
                postedAt: new Date().toISOString()
            };

            this.data.postedSongs.push(postedSong);
            
            // Keep only last 1000 posted songs to prevent file from growing too large
            if (this.data.postedSongs.length > 1000) {
                this.data.postedSongs = this.data.postedSongs.slice(-1000);
            }

            await this.save();
            logger.debug(`Added posted song to storage: ${song.title}`);
        } catch (error) {
            logger.error('Failed to add posted song to storage:', error);
            throw error;
        }
    }

    async isAlreadyPosted(songId) {
        return this.data.postedSongs.some(song => song.id === songId);
    }

    async clearPostedSongs() {
        this.data.postedSongs = [];
        await this.save();
        logger.info('Cleared all posted songs from storage');
    }

    // Get statistics
    getStats() {
        return {
            totalPostedSongs: this.data.postedSongs.length,
            oldestPost: this.data.postedSongs.length > 0 ? this.data.postedSongs[0].postedAt : null,
            newestPost: this.data.postedSongs.length > 0 ? this.data.postedSongs[this.data.postedSongs.length - 1].postedAt : null
        };
    }
}

module.exports = Storage;
