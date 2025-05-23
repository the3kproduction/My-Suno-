const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class SunoService {
    constructor() {
        this.apiUrl = config.suno.apiUrl;
        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'SunoDiscordBot/1.0'
            }
        });
    }

    async getLatestSongs(profileId, limit = 10) {
        try {
            logger.info(`Fetching latest songs for profile: ${profileId}`);
            
            // Try different potential Suno API endpoints
            const possibleEndpoints = [
                `/api/v1/users/${profileId}/songs`,
                `/api/users/${profileId}/songs`,
                `/v1/users/${profileId}/songs`,
                `/users/${profileId}/songs`,
                `/api/v1/profile/${profileId}/songs`,
                `/api/profile/${profileId}/songs`
            ];

            let songs = null;
            let lastError = null;

            for (const endpoint of possibleEndpoints) {
                try {
                    const url = `${this.apiUrl}${endpoint}`;
                    logger.debug(`Trying endpoint: ${url}`);
                    
                    // Try different parameter combinations to get newest songs (not top songs)
                    const paramSets = [
                        { limit: limit, sort: 'created_at', order: 'desc', filter: 'newest' },
                        { limit: limit, sort: 'date', order: 'desc', type: 'recent' },
                        { limit: limit, orderBy: 'created_at', order: 'desc', view: 'chronological' },
                        { limit: limit, sort: 'timestamp', order: 'desc', mode: 'newest' },
                        { limit: limit, sort: 'created_at', order: 'desc', tab: 'recent' },
                        { limit: limit, sort: 'created_at', order: 'desc' }
                    ];

                    let response = null;
                    for (const params of paramSets) {
                        try {
                            response = await this.httpClient.get(url, { params });
                            if (response.data && (Array.isArray(response.data) || response.data.songs || response.data.data)) {
                                break;
                            }
                        } catch (paramError) {
                            continue; // Try next parameter set
                        }
                    }

                    if (response.data && response.data.length > 0) {
                        songs = response.data;
                        logger.info(`Successfully fetched ${songs.length} songs from ${endpoint}`);
                        break;
                    } else if (response.data && Array.isArray(response.data)) {
                        songs = response.data;
                        logger.info(`Fetched empty song list from ${endpoint}`);
                        break;
                    } else if (response.data && response.data.songs) {
                        songs = response.data.songs;
                        logger.info(`Successfully fetched ${songs.length} songs from ${endpoint}`);
                        break;
                    } else if (response.data && response.data.data) {
                        songs = response.data.data;
                        logger.info(`Successfully fetched ${songs.length} songs from ${endpoint}`);
                        break;
                    }
                } catch (error) {
                    lastError = error;
                    if (error.response && error.response.status === 404) {
                        logger.debug(`Endpoint not found: ${endpoint}`);
                        continue;
                    } else if (error.response && error.response.status === 401) {
                        logger.warn(`Authentication failed for: ${endpoint}`);
                        continue;
                    } else {
                        logger.debug(`Error trying endpoint ${endpoint}:`, error.message);
                        continue;
                    }
                }
            }

            if (songs === null) {
                throw new Error(`Failed to fetch songs from any endpoint. Last error: ${lastError?.message || 'Unknown error'}`);
            }

            // Normalize song data
            return this.normalizeSongs(songs);

        } catch (error) {
            logger.error('Error fetching songs from Suno:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers,
                fullError: error
            });
            throw error;
        }
    }

    normalizeSongs(songs) {
        if (!Array.isArray(songs)) {
            logger.warn('Expected songs to be an array, got:', typeof songs);
            return [];
        }

        return songs.map(song => {
            // Normalize different possible song object structures
            const normalized = {
                id: song.id || song.song_id || song.uuid,
                title: song.title || song.name || song.display_name || 'Untitled',
                description: song.description || song.prompt || '',
                audio_url: song.audio_url || song.url || song.song_url || song.audio,
                image_url: song.image_url || song.thumbnail || song.cover_url,
                duration: song.duration || song.length,
                created_at: song.created_at || song.timestamp || song.date_created,
                url: song.audio_url || song.url || song.song_url || song.audio
            };

            // Ensure we have required fields
            if (!normalized.id) {
                logger.warn('Song missing ID:', song);
                normalized.id = `temp_${Date.now()}_${Math.random()}`;
            }

            if (!normalized.audio_url && !normalized.url) {
                logger.warn('Song missing audio URL:', song);
                normalized.audio_url = '#';
                normalized.url = '#';
            }

            return normalized;
        }).filter(song => song.id && (song.audio_url || song.url));
    }

    async testConnection() {
        try {
            const response = await this.httpClient.get(`${this.apiUrl}/api/health`, { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            logger.debug('Health check failed, API might not have health endpoint');
            return false;
        }
    }
}

module.exports = SunoService;
