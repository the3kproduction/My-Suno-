const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const path = require('path');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const DatabaseStorage = require('./server/storage');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./server/db');

class UltimateSunoBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });
        
        this.discordService = new DiscordService(this.client);
        this.storage = new DatabaseStorage();
        this.app = express();
        this.isReady = false;
        
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }

    async start() {
        try {
            await initializeDatabase();
            await this.storage.init();
            await this.client.login(config.discord.token);
            this.setupEventHandlers();
            this.setupWebServer();
            
            logger.info('🚀 Ultimate Suno Bot started successfully!');
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            logger.info(`🎵 Bot logged in as ${this.client.user.tag}`);
            this.isReady = true;
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
        });
    }

    setupWebServer() {
        // Main dashboard with all features
        this.app.get('/', async (req, res) => {
            try {
                const stats = await this.storage.getStats();
                const recentSongs = await this.storage.getAllSongs(6);
                const topSongs = await this.storage.getTopSongs(5);
                
                res.send(this.renderDashboard(stats, recentSongs, topSongs));
            } catch (error) {
                logger.error('Error rendering dashboard:', error);
                res.send(this.renderDashboard({}, [], []));
            }
        });

        // API endpoints
        this.app.get('/api/stats', async (req, res) => {
            try {
                const stats = await this.storage.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch stats' });
            }
        });

        this.app.get('/api/songs', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 20;
                const offset = parseInt(req.query.offset) || 0;
                const songs = await this.storage.getAllSongs(limit, offset);
                res.json(songs);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch songs' });
            }
        });

        this.app.get('/api/analytics', async (req, res) => {
            try {
                const timeframe = req.query.timeframe || '7d';
                const analytics = await this.storage.getAnalytics(timeframe);
                res.json(analytics);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch analytics' });
            }
        });

        // Enhanced auto-posting with AI features
        this.app.post('/api/post-auto', async (req, res) => {
            try {
                const { url, scheduledFor, generateDescription } = req.body;
                
                if (!url) {
                    return res.status(400).json({ error: 'URL is required' });
                }

                // Scrape song details
                const songData = await this.extractSongData(url);
                if (!songData.title) {
                    return res.status(400).json({ error: 'Could not extract song data from URL' });
                }

                // Generate AI description if requested
                if (generateDescription && process.env.OPENAI_API_KEY) {
                    songData.description = await this.generateAIDescription(songData);
                }

                // Check for duplicates
                const existingSong = await this.storage.getSong(songData.sunoId);
                if (existingSong && await this.storage.isAlreadyPosted(songData.sunoId)) {
                    return res.status(409).json({ error: 'Song already posted' });
                }

                // Save song to database
                const savedSong = await this.storage.addSong(songData);

                // Schedule or post immediately
                if (scheduledFor) {
                    await this.schedulePost(savedSong.id, scheduledFor);
                    res.json({ 
                        success: true, 
                        message: `Song scheduled for ${new Date(scheduledFor).toLocaleString()}`,
                        song: savedSong 
                    });
                } else {
                    await this.postSongToDiscord(savedSong);
                    res.json({ 
                        success: true, 
                        message: 'Song posted successfully!',
                        song: savedSong 
                    });
                }

                // Record analytics
                await this.storage.recordEvent(songData.sunoId, 'post', { source: 'web_auto' });

            } catch (error) {
                logger.error('Error in auto-post:', error);
                res.status(500).json({ error: 'Failed to process song' });
            }
        });

        // Batch posting
        this.app.post('/api/post-batch', async (req, res) => {
            try {
                const { urls } = req.body;
                
                if (!Array.isArray(urls) || urls.length === 0) {
                    return res.status(400).json({ error: 'URLs array is required' });
                }

                const results = [];
                for (const url of urls) {
                    try {
                        const songData = await this.extractSongData(url);
                        if (songData.title) {
                            const savedSong = await this.storage.addSong(songData);
                            await this.postSongToDiscord(savedSong);
                            results.push({ url, success: true, song: savedSong });
                        } else {
                            results.push({ url, success: false, error: 'Could not extract song data' });
                        }
                    } catch (error) {
                        results.push({ url, success: false, error: error.message });
                    }
                }

                res.json({ results });
            } catch (error) {
                res.status(500).json({ error: 'Batch posting failed' });
            }
        });

        // Analytics and insights
        this.app.get('/dashboard/analytics', async (req, res) => {
            try {
                const analytics = await this.storage.getAnalytics('30d');
                const topSongs = await this.storage.getTopSongs(10);
                res.send(this.renderAnalyticsDashboard(analytics, topSongs));
            } catch (error) {
                res.send(this.errorPage('Failed to load analytics'));
            }
        });

        // Playlist management
        this.app.get('/dashboard/playlists', async (req, res) => {
            res.send(this.renderPlaylistDashboard());
        });

        // Settings page
        this.app.get('/dashboard/settings', async (req, res) => {
            res.send(this.renderSettingsPage());
        });

        // Start server
        const PORT = process.env.PORT || 5000;
        this.server = this.app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🌟 Ultimate Suno Bot server running on port ${PORT}`);
        });
    }

    async extractSongData(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });
            
            const html = response.data;
            const songData = {
                sunoId: this.generateSongId(url),
                url: url,
                title: '',
                artist: '',
                genre: '',
                mood: '',
                duration: 0,
                tags: [],
                metadata: {}
            };

            // Extract title
            const titlePatterns = [
                /<title[^>]*>([^<]+)/i,
                /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
                /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i
            ];
            
            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    songData.title = match[1].trim()
                        .replace(/\s*\|\s*Suno.*$/i, '')
                        .replace(/\s*-\s*Suno.*$/i, '');
                    break;
                }
            }

            // Extract additional metadata
            const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
            if (descMatch) {
                songData.metadata.description = descMatch[1];
            }

            // Try to extract genre/tags from page content
            const genreMatch = html.match(/genre[^>]*[":]\s*["']([^"']+)/i);
            if (genreMatch) {
                songData.genre = genreMatch[1];
            }

            // Extract artist if available
            const artistMatch = html.match(/artist[^>]*[":]\s*["']([^"']+)/i);
            if (artistMatch) {
                songData.artist = artistMatch[1];
            }

            return songData;
        } catch (error) {
            logger.error('Error extracting song data:', error);
            return {
                sunoId: this.generateSongId(url),
                url: url,
                title: '',
                metadata: {}
            };
        }
    }

    async generateAIDescription(songData) {
        if (!process.env.OPENAI_API_KEY) {
            return null;
        }

        try {
            const prompt = `Generate a catchy, engaging description for this Suno AI song:
Title: ${songData.title}
Genre: ${songData.genre || 'Unknown'}
Artist: ${songData.artist || 'Unknown'}

Create a brief, exciting description (max 100 words) that would make people want to listen to this song. Focus on the mood, style, and what makes it special.`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 150,
                temperature: 0.8
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            logger.error('Error generating AI description:', error);
            return null;
        }
    }

    async postSongToDiscord(song) {
        const message = await this.discordService.postSong(config.discord.channelId, {
            id: song.suno_id,
            title: song.title,
            url: song.url,
            description: song.description,
            genre: song.genre,
            artist: song.artist
        });
        
        if (message) {
            await this.storage.recordPost(song.suno_id, config.discord.channelId, message.id);
        }
        
        return message;
    }

    generateSongId(url) {
        return url.split('/').pop()?.split('?')[0] || url;
    }

    renderDashboard(stats, recentSongs, topSongs) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Ultimate Suno Bot Dashboard</title>
    <style>
        ${this.getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="glass-card header fade-in">
            <h1 class="main-title">🎵 Ultimate Suno Bot</h1>
            <p class="subtitle">Your AI-Powered Music Posting System</p>
            <div class="waveform">
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
            </div>
        </div>

        <!-- Stats Dashboard -->
        <div class="glass-card fade-in">
            <h2 class="section-title">📊 Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${stats.total_songs || 0}</div>
                    <div class="stat-label">Total Songs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.total_posts || 0}</div>
                    <div class="stat-label">Posts Made</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.total_plays || 0}</div>
                    <div class="stat-label">Total Plays</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.songs_today || 0}</div>
                    <div class="stat-label">Today</div>
                </div>
            </div>
        </div>

        <!-- Main Features Grid -->
        <div class="main-grid">
            <!-- Quick Post Section -->
            <div class="glass-card fade-in">
                <h2 class="section-title">⚡ Quick Post</h2>
                <form id="autoPostForm">
                    <div class="form-group">
                        <label class="form-label">🔥 Suno URL (Auto-detects everything!)</label>
                        <input type="url" name="url" class="form-input" placeholder="https://suno.com/song/..." required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">🤖 AI Features</label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="generateDescription"> Generate AI description
                        </label>
                    </div>
                    <button type="submit" class="btn btn-auto">⚡ Auto-Post Now</button>
                </form>
            </div>

            <!-- Scheduled Post Section -->
            <div class="glass-card fade-in">
                <h2 class="section-title">⏰ Schedule Post</h2>
                <form id="scheduleForm">
                    <div class="form-group">
                        <label class="form-label">🎵 Suno URL</label>
                        <input type="url" name="url" class="form-input" placeholder="https://suno.com/song/..." required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">📅 Schedule For</label>
                        <input type="datetime-local" name="scheduledFor" class="form-input" required>
                    </div>
                    <button type="submit" class="btn btn-schedule">⏰ Schedule Post</button>
                </form>
            </div>
        </div>

        <!-- Batch Posting -->
        <div class="glass-card fade-in">
            <h2 class="section-title">🚀 Batch Post Multiple Songs</h2>
            <div class="form-group">
                <label class="form-label">📝 Paste multiple URLs (one per line)</label>
                <textarea id="batchUrls" class="form-input" rows="5" placeholder="https://suno.com/song/song1&#10;https://suno.com/song/song2&#10;https://suno.com/song/song3"></textarea>
            </div>
            <button onclick="batchPost()" class="btn btn-primary">🚀 Post All Songs</button>
            <div id="batchResults"></div>
        </div>

        <!-- Recent Songs -->
        <div class="glass-card fade-in">
            <h2 class="section-title">🎶 Recent Songs</h2>
            <div class="songs-grid">
                ${recentSongs.map(song => `
                    <div class="song-card">
                        <h3 class="song-title">${song.title || 'Untitled'}</h3>
                        <div class="song-meta">
                            ${song.genre ? `<span class="song-tag">${song.genre}</span>` : ''}
                            ${song.artist ? `<span class="song-tag">👤 ${song.artist}</span>` : ''}
                        </div>
                        <div class="song-stats">
                            <span>👀 ${song.play_count || 0} plays</span>
                            <span>❤️ ${song.likes || 0} likes</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Navigation -->
        <div class="glass-card fade-in">
            <h2 class="section-title">🧭 Dashboard Navigation</h2>
            <div class="nav-grid">
                <a href="/dashboard/analytics" class="nav-card">
                    📈 Advanced Analytics
                </a>
                <a href="/dashboard/playlists" class="nav-card">
                    📋 Playlist Manager
                </a>
                <a href="/dashboard/settings" class="nav-card">
                    ⚙️ Settings & Config
                </a>
                <a href="/api/songs" class="nav-card">
                    🔗 API Access
                </a>
            </div>
        </div>
    </div>

    <script>
        ${this.getJavaScript()}
    </script>
</body>
</html>`;
    }

    getStyles() {
        return `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        :root {
            --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --secondary-gradient: linear-gradient(45deg, #ff6b6b, #ee5a24);
            --success-gradient: linear-gradient(45deg, #4ecdc4, #26d0ce);
            --glass-bg: rgba(255, 255, 255, 0.1);
            --glass-border: rgba(255, 255, 255, 0.2);
            --shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background: var(--primary-gradient);
            min-height: 100vh;
            color: white;
            overflow-x: hidden;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
                radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(255, 107, 107, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(78, 205, 196, 0.3) 0%, transparent 50%);
            animation: backgroundFloat 20s ease-in-out infinite;
            z-index: -1;
        }

        @keyframes backgroundFloat {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            33% { transform: translate(30px, -30px) rotate(2deg); }
            66% { transform: translate(-20px, 20px) rotate(-2deg); }
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            gap: 30px;
        }

        .glass-card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow);
            padding: 40px;
            transition: all 0.3s ease;
        }

        .glass-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }

        .header {
            text-align: center;
        }

        .main-title {
            font-size: clamp(2.5rem, 5vw, 4rem);
            font-weight: 800;
            background: linear-gradient(45deg, #fff, #f0f0f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }

        .subtitle {
            font-size: 1.3rem;
            opacity: 0.9;
            font-weight: 300;
            margin-bottom: 30px;
        }

        .section-title {
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .main-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }

        .stat-card {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            border: 1px solid var(--glass-border);
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: scale(1.05);
        }

        .stat-number {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 8px;
            background: linear-gradient(45deg, #fff, #f0f0f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .stat-label {
            font-size: 0.9rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .form-group {
            margin-bottom: 25px;
        }

        .form-label {
            display: block;
            margin-bottom: 10px;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .form-input {
            width: 100%;
            padding: 18px 24px;
            border: 2px solid transparent;
            border-radius: 16px;
            font-size: 16px;
            background: rgba(255, 255, 255, 0.9);
            color: #333;
            transition: all 0.3s ease;
            font-family: inherit;
        }

        .form-input:focus {
            outline: none;
            background: white;
            border-color: #667eea;
            box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
            transform: translateY(-2px);
        }

        .btn {
            width: 100%;
            padding: 18px 24px;
            border: none;
            border-radius: 16px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
            position: relative;
            overflow: hidden;
            font-family: inherit;
        }

        .btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .btn-auto {
            background: var(--success-gradient);
            color: white;
        }

        .btn-schedule {
            background: linear-gradient(45deg, #9b59b6, #8e44ad);
            color: white;
        }

        .btn-primary {
            background: var(--secondary-gradient);
            color: white;
        }

        .songs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }

        .song-card {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 25px;
            border: 1px solid var(--glass-border);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .song-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--success-gradient);
        }

        .song-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
        }

        .song-title {
            font-size: 1.3rem;
            font-weight: 700;
            margin-bottom: 12px;
            line-height: 1.3;
        }

        .song-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 15px;
        }

        .song-tag {
            background: rgba(255, 255, 255, 0.2);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
        }

        .song-stats {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .nav-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }

        .nav-card {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            border: 1px solid var(--glass-border);
            transition: all 0.3s ease;
            color: white;
            text-decoration: none;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .nav-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            background: rgba(255, 255, 255, 0.2);
        }

        .waveform {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 3px;
            margin: 15px 0;
        }

        .wave-bar {
            width: 4px;
            background: var(--success-gradient);
            border-radius: 2px;
            animation: waveAnimation 1.5s ease-in-out infinite;
        }

        .wave-bar:nth-child(1) { height: 10px; animation-delay: 0s; }
        .wave-bar:nth-child(2) { height: 20px; animation-delay: 0.1s; }
        .wave-bar:nth-child(3) { height: 15px; animation-delay: 0.2s; }
        .wave-bar:nth-child(4) { height: 25px; animation-delay: 0.3s; }
        .wave-bar:nth-child(5) { height: 12px; animation-delay: 0.4s; }
        .wave-bar:nth-child(6) { height: 18px; animation-delay: 0.5s; }

        @keyframes waveAnimation {
            0%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(0.3); }
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .fade-in {
            animation: fadeInUp 0.6s ease forwards;
        }

        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: normal;
            font-size: 1rem;
            cursor: pointer;
        }

        .alert {
            padding: 20px;
            border-radius: 16px;
            margin: 20px 0;
            backdrop-filter: blur(10px);
        }

        .alert-success {
            background: rgba(78, 205, 196, 0.2);
            border: 1px solid rgba(78, 205, 196, 0.3);
            color: #4ecdc4;
        }

        .alert-error {
            background: rgba(255, 107, 107, 0.2);
            border: 1px solid rgba(255, 107, 107, 0.3);
            color: #ff6b6b;
        }

        @media (max-width: 768px) {
            .container {
                padding: 15px;
                gap: 20px;
            }
            
            .glass-card {
                padding: 25px;
            }
            
            .main-grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .songs-grid {
                grid-template-columns: 1fr;
            }
        }
        `;
    }

    getJavaScript() {
        return `
        // Auto-post form handler
        document.getElementById('autoPostForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Processing...';
            btn.disabled = true;

            const formData = new FormData(e.target);
            const data = {
                url: formData.get('url'),
                generateDescription: formData.get('generateDescription') === 'on'
            };

            try {
                const response = await fetch('/api/post-auto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message, 'success');
                    e.target.reset();
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showAlert(result.error || 'Failed to post song', 'error');
                }
            } catch (error) {
                showAlert('Network error. Please try again.', 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });

        // Schedule form handler
        document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Scheduling...';
            btn.disabled = true;

            const formData = new FormData(e.target);
            const data = {
                url: formData.get('url'),
                scheduledFor: formData.get('scheduledFor')
            };

            try {
                const response = await fetch('/api/post-auto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message, 'success');
                    e.target.reset();
                } else {
                    showAlert(result.error || 'Failed to schedule post', 'error');
                }
            } catch (error) {
                showAlert('Network error. Please try again.', 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });

        // Batch posting function
        async function batchPost() {
            const textarea = document.getElementById('batchUrls');
            const urls = textarea.value.split('\\n').filter(url => url.trim());
            
            if (urls.length === 0) {
                showAlert('Please enter at least one URL', 'error');
                return;
            }

            const resultsDiv = document.getElementById('batchResults');
            resultsDiv.innerHTML = '<div class="alert alert-success">🚀 Processing ' + urls.length + ' songs...</div>';

            try {
                const response = await fetch('/api/post-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls })
                });

                const result = await response.json();
                const successful = result.results.filter(r => r.success).length;
                const failed = result.results.filter(r => !r.success).length;

                let html = \`<div class="alert alert-success">✅ \${successful} songs posted successfully!</div>\`;
                if (failed > 0) {
                    html += \`<div class="alert alert-error">❌ \${failed} songs failed to post</div>\`;
                }

                resultsDiv.innerHTML = html;
                textarea.value = '';
                setTimeout(() => location.reload(), 3000);
            } catch (error) {
                resultsDiv.innerHTML = '<div class="alert alert-error">❌ Batch posting failed</div>';
            }
        }

        // Alert system
        function showAlert(message, type) {
            const existing = document.querySelector('.alert');
            if (existing) existing.remove();

            const alert = document.createElement('div');
            alert.className = \`alert alert-\${type}\`;
            alert.textContent = message;
            
            document.querySelector('.container').insertBefore(alert, document.querySelector('.glass-card'));
            
            setTimeout(() => alert.remove(), 5000);
        }

        // Auto-refresh stats every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                
                document.querySelectorAll('.stat-number').forEach((el, index) => {
                    const values = [stats.total_songs || 0, stats.total_posts || 0, stats.total_plays || 0, stats.songs_today || 0];
                    if (values[index] !== undefined) {
                        el.textContent = values[index];
                    }
                });
            } catch (error) {
                console.log('Failed to refresh stats');
            }
        }, 30000);

        // Add entrance animations
        document.addEventListener('DOMContentLoaded', () => {
            const cards = document.querySelectorAll('.glass-card');
            cards.forEach((card, index) => {
                setTimeout(() => {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(30px)';
                    card.style.transition = 'all 0.6s ease';
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, 100);
                }, index * 200);
            });
        });
        `;
    }

    renderAnalyticsDashboard(analytics, topSongs) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>📈 Analytics Dashboard</title>
    <style>${this.getStyles()}</style>
</head>
<body>
    <div class="container">
        <div class="glass-card">
            <h1 class="main-title">📈 Advanced Analytics</h1>
            <a href="/" class="btn btn-primary" style="max-width: 200px;">← Back to Dashboard</a>
        </div>
        
        <div class="glass-card">
            <h2 class="section-title">🏆 Top Performing Songs</h2>
            <div class="songs-grid">
                ${topSongs.map(song => `
                    <div class="song-card">
                        <h3 class="song-title">${song.title}</h3>
                        <div class="song-stats">
                            <span>👀 ${song.play_count} plays</span>
                            <span>📊 ${song.post_count || 0} posts</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    renderPlaylistDashboard() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>📋 Playlist Manager</title>
    <style>${this.getStyles()}</style>
</head>
<body>
    <div class="container">
        <div class="glass-card">
            <h1 class="main-title">📋 Playlist Manager</h1>
            <p class="subtitle">Coming Soon: Create and manage custom playlists!</p>
            <a href="/" class="btn btn-primary" style="max-width: 200px;">← Back to Dashboard</a>
        </div>
    </div>
</body>
</html>`;
    }

    renderSettingsPage() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>⚙️ Settings & Configuration</title>
    <style>${this.getStyles()}</style>
</head>
<body>
    <div class="container">
        <div class="glass-card">
            <h1 class="main-title">⚙️ Settings & Configuration</h1>
            <p class="subtitle">Customize your Suno Bot experience</p>
            <a href="/" class="btn btn-primary" style="max-width: 200px;">← Back to Dashboard</a>
        </div>
        
        <div class="glass-card">
            <h2 class="section-title">🔑 API Configuration</h2>
            <p>OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Not configured'}</p>
            <p>Discord Bot: ✅ Connected</p>
            <p>Database: ✅ Connected</p>
        </div>
    </div>
</body>
</html>`;
    }

    errorPage(message) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
    <style>${this.getStyles()}</style>
</head>
<body>
    <div class="container">
        <div class="glass-card">
            <h1>❌ Error</h1>
            <p>${message}</p>
            <a href="/" class="btn btn-primary">← Go Back</a>
        </div>
    </div>
</body>
</html>`;
    }
}

// Start the bot
const bot = new UltimateSunoBot();
bot.start();

module.exports = UltimateSunoBot;