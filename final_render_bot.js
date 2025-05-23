const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

<<<<<<< HEAD
=======
// Configuration with your new Discord channel
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID || '1375419981658849342' // Your new Discord server channel
    }
};

>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
// Simple logger
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};

<<<<<<< HEAD
// Configuration with your new Discord channel
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID || '1375419981658849342'
    }
};

=======
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
class FinalSunoBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
        this.app = express();
        this.isReady = false;
        this.postedSongs = new Set();
        
<<<<<<< HEAD
        this.storage = {
            songs: [],
            load: () => {
                try {
                    return JSON.parse(require('fs').readFileSync('./data/posted_songs.json', 'utf8'));
                } catch {
                    return [];
                }
            },
            save: (songs) => {
                try {
                    require('fs').mkdirSync('./data', { recursive: true });
                    require('fs').writeFileSync('./data/posted_songs.json', JSON.stringify(songs, null, 2));
                } catch (err) {
                    logger.error('Failed to save songs', err);
                }
            }
        };
=======
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
    }

    async start() {
        try {
            await this.client.login(config.discord.token);
<<<<<<< HEAD
            logger.info('Discord bot logged in successfully');
            
            this.setupEventHandlers();
            this.setupWebServer();
            
            // Load existing songs
            this.storage.songs = this.storage.load();
            this.storage.songs.forEach(song => this.postedSongs.add(song.id));
            
            this.isReady = true;
            logger.info('Bot is ready!');
        } catch (error) {
            logger.error('Failed to start bot', error);
=======
            this.setupEventHandlers();
            this.setupWebServer();
            
            logger.info('🚀 AI Suno Bot started successfully!');
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
        }
    }

    setupEventHandlers() {
<<<<<<< HEAD
        this.client.on('ready', () => {
            logger.info(`Logged in as ${this.client.user.tag}`);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error', error);
=======
        this.client.once('ready', () => {
            logger.info(`🎵 Bot logged in as ${this.client.user.tag}`);
            this.isReady = true;
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
        });
    }

    setupWebServer() {
<<<<<<< HEAD
        this.app.use(express.static('public'));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Main page
        this.app.get('/', (req, res) => {
            const stats = {
                totalSongs: this.storage.songs.length,
                isReady: this.isReady
            };
            
            const recentSongs = this.storage.songs
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10);

            res.send(this.renderDashboard(stats, recentSongs));
        });

        // Post song endpoint
        this.app.post('/post-song', async (req, res) => {
            try {
                const { url, title, description, useAI } = req.body;
                
                if (!url || !title) {
                    return res.status(400).json({ error: 'URL and title are required' });
                }

                let finalDescription = description || '';
                
                if (useAI && process.env.OPENAI_API_KEY) {
                    try {
                        finalDescription = await this.generateAIFeatures({ title, url });
                    } catch (error) {
                        logger.warn('AI enhancement failed, using manual description');
                    }
                }

                await this.postToDiscord(title, url, finalDescription);
                
                const song = {
                    id: this.generateSongId(url),
                    title,
                    url,
                    description: finalDescription,
                    timestamp: new Date().toISOString()
                };
                
                this.storage.songs.unshift(song);
                this.storage.songs = this.storage.songs.slice(0, 50); // Keep last 50
                this.storage.save(this.storage.songs);
                this.postedSongs.add(song.id);

                res.json({ success: true, message: 'Song posted successfully!' });
            } catch (error) {
                logger.error('Error posting song', error);
                res.status(500).json({ error: 'Failed to post song' });
            }
        });

        // Extract song data
        this.app.post('/extract-song', async (req, res) => {
            try {
                const { url } = req.body;
                const songData = await this.extractSongData(url);
                res.json(songData);
            } catch (error) {
                logger.error('Error extracting song data', error);
                res.status(500).json({ error: 'Failed to extract song data' });
            }
        });

        // Share again endpoint
        this.app.post('/share-again/:songId', async (req, res) => {
            try {
                const song = this.storage.songs.find(s => s.id === req.params.songId);
                if (!song) {
                    return res.status(404).json({ error: 'Song not found' });
                }

                await this.postToDiscord(song.title, song.url, song.description);
                res.json({ success: true, message: 'Song shared again successfully!' });
            } catch (error) {
                logger.error('Error sharing song again', error);
                res.status(500).json({ error: 'Failed to share song again' });
=======
        // Main dashboard
        this.app.get('/', (req, res) => {
            const hasAI = !!process.env.OPENAI_API_KEY;
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>🤖 AI Suno Discord Bot</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
                        
                        body {
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            max-width: 800px;
                            margin: 50px auto;
                            padding: 20px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            color: white;
                            position: relative;
                            overflow-x: hidden;
                        }
                        
                        body::before {
                            content: '';
                            position: fixed;
                            top: 0; left: 0; width: 100%; height: 100%;
                            background: 
                                radial-gradient(circle at 20% 80%, rgba(0, 212, 255, 0.2) 0%, transparent 50%),
                                radial-gradient(circle at 80% 20%, rgba(102, 126, 234, 0.3) 0%, transparent 50%);
                            animation: float 20s ease-in-out infinite;
                            z-index: -1;
                        }
                        
                        @keyframes float {
                            0%, 100% { transform: translate(0, 0) rotate(0deg); }
                            50% { transform: translate(30px, -30px) rotate(2deg); }
                        }
                        
                        .container {
                            background: rgba(255, 255, 255, 0.1);
                            padding: 40px;
                            border-radius: 24px;
                            backdrop-filter: blur(20px);
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            transition: all 0.3s ease;
                        }
                        
                        .ai-badge {
                            display: inline-block;
                            background: linear-gradient(45deg, #00d4ff, #090979);
                            padding: 8px 20px;
                            border-radius: 50px;
                            font-size: 0.9rem;
                            font-weight: 600;
                            margin-bottom: 20px;
                            animation: pulse 2s infinite;
                            text-align: center;
                        }
                        
                        @keyframes pulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                            100% { transform: scale(1); }
                        }
                        
                        h1 {
                            text-align: center;
                            margin-bottom: 30px;
                            font-size: clamp(2.5rem, 5vw, 3.5rem);
                            font-weight: 800;
                            background: linear-gradient(45deg, #fff, #00d4ff);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        
                        .subtitle {
                            text-align: center;
                            font-size: 1.2rem;
                            opacity: 0.9;
                            margin-bottom: 40px;
                            font-weight: 300;
                        }
                        
                        .form-group {
                            margin-bottom: 25px;
                        }
                        
                        label {
                            display: block;
                            margin-bottom: 10px;
                            font-weight: 600;
                            font-size: 1.1rem;
                        }
                        
                        input[type="text"], input[type="url"] {
                            width: 100%;
                            padding: 18px 24px;
                            border: 2px solid transparent;
                            border-radius: 16px;
                            font-size: 16px;
                            background: rgba(255, 255, 255, 0.9);
                            color: #333;
                            box-sizing: border-box;
                            transition: all 0.3s ease;
                        }
                        
                        input:focus {
                            outline: none;
                            background: white;
                            border-color: #00d4ff;
                            box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.1);
                            transform: translateY(-2px);
                        }
                        
                        .ai-section {
                            background: rgba(0, 212, 255, 0.1);
                            border: 1px solid rgba(0, 212, 255, 0.2);
                            border-radius: 16px;
                            padding: 20px;
                            margin: 20px 0;
                        }
                        
                        .checkbox-group {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            margin: 15px 0;
                        }
                        
                        button {
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
                            margin-bottom: 15px;
                        }
                        
                        button:hover {
                            transform: translateY(-3px);
                            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
                        }
                        
                        .btn-ai {
                            background: linear-gradient(45deg, #00d4ff, #090979);
                            color: white;
                        }
                        
                        .btn-quick {
                            background: linear-gradient(45deg, #4ecdc4, #26d0ce);
                            color: white;
                        }
                        
                        .btn-manual {
                            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
                            color: white;
                        }
                        
                        .or-divider {
                            text-align: center;
                            margin: 30px 0;
                            font-size: 1.2em;
                            font-weight: bold;
                            opacity: 0.8;
                        }
                        
                        .status-info {
                            background: rgba(0, 212, 255, 0.1);
                            border: 1px solid rgba(0, 212, 255, 0.2);
                            border-radius: 16px;
                            padding: 20px;
                            margin-top: 30px;
                            text-align: center;
                        }
                        
                        .status-info h3 {
                            color: #00d4ff;
                            margin-bottom: 15px;
                        }
                        
                        @media (max-width: 768px) {
                            body { margin: 20px auto; padding: 15px; }
                            .container { padding: 25px; }
                            h1 { font-size: 2.5rem; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div style="text-align: center;">
                            <div class="ai-badge">🤖 AI-POWERED</div>
                        </div>
                        <h1>🎵 AI Suno Discord Bot</h1>
                        <p class="subtitle">Intelligent Music Posting with AI-Generated Content</p>
                        
                        ${hasAI ? `
                        <form method="POST" action="/post-song-ai">
                            <div class="ai-section">
                                <h3 style="color: #00d4ff; margin-bottom: 15px;">🤖 AI-Enhanced Posting</h3>
                                <div class="form-group">
                                    <label for="ai-url">🔗 Paste your Suno link:</label>
                                    <input type="url" id="ai-url" name="url" required placeholder="https://suno.com/song/...">
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="generateAI" name="generateAI" checked>
                                    <label for="generateAI">🧠 Generate AI description & hashtags</label>
                                </div>
                                <button type="submit" class="btn-ai">🚀 Post with AI Magic</button>
                            </div>
                        </form>
                        <div class="or-divider">— OR —</div>
                        ` : ''}
                        
                        <form method="POST" action="/post-song-auto">
                            <div class="form-group">
                                <label for="auto-url">⚡ Quick post (auto-fills title):</label>
                                <input type="url" id="auto-url" name="url" required placeholder="https://suno.com/song/...">
                            </div>
                            <button type="submit" class="btn-quick">⚡ Quick Auto-Post</button>
                        </form>

                        <div class="or-divider">— OR —</div>

                        <form method="POST" action="/post-song">
                            <div class="form-group">
                                <label for="title">Song Title (manual):</label>
                                <input type="text" id="title" name="title" required placeholder="Enter the song title...">
                            </div>
                            <div class="form-group">
                                <label for="url">Suno URL:</label>
                                <input type="url" id="url" name="url" required placeholder="https://suno.com/song/...">
                            </div>
                            <button type="submit" class="btn-manual">🎵 Manual Post</button>
                        </form>
                        
                        <div class="status-info">
                            <h3>🎯 Bot Status</h3>
                            <p>🆕 <strong>Now posting to your NEW Discord server!</strong></p>
                            <p>OpenAI AI: ${hasAI ? '✅ Connected & Ready!' : '❌ Not configured'}</p>
                            <p>Discord Bot: ✅ Active in your new server</p>
                            <p>Enhanced Extraction: ✅ Smart song detection</p>
                            <p>Duplicate Prevention: ✅ Won't post the same song twice</p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        // AI posting endpoint
        this.app.post('/post-song-ai', async (req, res) => {
            try {
                const { url, generateAI } = req.body;
                logger.info(`AI posting request for: ${url}`);
                
                const songData = await this.extractSongData(url);
                
                if (!songData.title) {
                    logger.error('Failed to extract title from URL');
                    return res.send(this.errorPage('Could not extract song title from URL. Please try manual posting with the title.'));
                }

                const songId = this.generateSongId(url);
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('Song already posted'));
                }

                // Generate AI features if requested
                if (generateAI && process.env.OPENAI_API_KEY) {
                    try {
                        logger.info('Generating AI features...');
                        const aiFeatures = await this.generateAIFeatures(songData);
                        songData.description = aiFeatures.description;
                        songData.hashtags = aiFeatures.hashtags;
                    } catch (aiError) {
                        logger.warn('AI generation failed:', aiError.message);
                    }
                }

                await this.postToDiscord(songData.title, url, songData.description, songData.hashtags);
                this.postedSongs.add(songId);

                const message = generateAI && songData.description ? 
                    `🤖 "${songData.title}" posted with AI features to your new Discord server!` :
                    `🎵 "${songData.title}" posted successfully to your new Discord server!`;

                res.send(this.successPage(songData.title, message));
                
            } catch (error) {
                logger.error('Error in AI post:', error);
                res.send(this.errorPage('Failed to post song. Please check the URL and try again.'));
            }
        });

        // Quick auto posting
        this.app.post('/post-song-auto', async (req, res) => {
            try {
                const { url } = req.body;
                logger.info(`Quick posting request for: ${url}`);
                
                const songData = await this.extractSongData(url);
                
                if (!songData.title) {
                    logger.error('Failed to extract title from URL');
                    return res.send(this.errorPage('Could not extract song title. Please use manual posting.'));
                }

                const songId = this.generateSongId(url);
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('Song already posted'));
                }

                await this.postToDiscord(songData.title, url);
                this.postedSongs.add(songId);

                res.send(this.successPage(songData.title, `🎵 "${songData.title}" posted successfully to your new Discord server!`));
                
            } catch (error) {
                logger.error('Error in auto post:', error);
                res.send(this.errorPage('Failed to post song. Please try manual posting.'));
            }
        });

        // Manual posting
        this.app.post('/post-song', async (req, res) => {
            try {
                const { title, url } = req.body;
                logger.info(`Manual posting request: ${title} - ${url}`);
                
                if (!title || !url) {
                    return res.send(this.errorPage('Please provide both title and URL'));
                }

                const songId = this.generateSongId(url);
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('Song already posted'));
                }

                await this.postToDiscord(title, url);
                this.postedSongs.add(songId);

                res.send(this.successPage(title, `🎵 "${title}" posted successfully to your new Discord server!`));
                
            } catch (error) {
                logger.error('Error in manual post:', error);
                res.send(this.errorPage('Failed to post song. Please check your Discord bot permissions.'));
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
            }
        });

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
<<<<<<< HEAD
            logger.info(`Web server running on port ${PORT}`);
=======
            logger.info(`🌟 AI Suno Bot running on port ${PORT}`);
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
        });
    }

    async extractSongData(url) {
        try {
<<<<<<< HEAD
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = response.data;
            let title = 'Unknown Song';

            // Try multiple extraction methods
            const titlePatterns = [
                /<title[^>]*>([^<]+)/i,
                /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
                /<meta[^>]+name="title"[^>]+content="([^"]+)"/i,
                /"title"\s*:\s*"([^"]+)"/i
            ];

            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1] && match[1].trim() !== 'Suno') {
                    title = match[1].trim().replace(/\s*\|\s*Suno\s*$/, '');
                    break;
                }
            }

            return { title, url };
        } catch (error) {
            logger.error('Error extracting song data', error);
            return { title: 'Unknown Song', url };
=======
            logger.info(`Extracting song data from: ${url}`);
            
            // Enhanced extraction with multiple methods
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive'
                },
                timeout: 15000
            });
            
            const html = response.data;
            
            // Multiple extraction patterns for better success rate
            const titlePatterns = [
                // OpenGraph title
                /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
                // Twitter title
                /<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i,
                // Page title
                /<title[^>]*>([^<]+)<\/title>/i,
                // JSON-LD structured data
                /"name"\s*:\s*"([^"]+)"/i,
                // Common heading patterns
                /<h1[^>]*>([^<]+)<\/h1>/i,
                /<h2[^>]*>([^<]+)<\/h2>/i
            ];
            
            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    let title = match[1].trim();
                    
                    // Clean up common suffixes and prefixes
                    title = title
                        .replace(/\s*\|\s*Suno.*$/i, '')
                        .replace(/\s*-\s*Suno.*$/i, '')
                        .replace(/^Suno\s*[\|\-]\s*/i, '')
                        .replace(/\s*\|\s*.*AI.*$/i, '')
                        .replace(/\s*-\s*.*AI.*$/i, '')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .trim();
                    
                    if (title && title.length > 0 && title.length < 200) {
                        logger.info(`Successfully extracted title: ${title}`);
                        return { title };
                    }
                }
            }

            // Fallback: try to extract from URL
            const urlMatch = url.match(/\/song\/([^\/\?]+)/i);
            if (urlMatch) {
                const urlTitle = decodeURIComponent(urlMatch[1])
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                    .trim();
                
                if (urlTitle && urlTitle.length > 0) {
                    logger.info(`Extracted title from URL: ${urlTitle}`);
                    return { title: urlTitle };
                }
            }

            logger.error('No title found with any pattern');
            return { title: '' };
            
        } catch (error) {
            logger.error('Error extracting song data:', error.message);
            return { title: '' };
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
        }
    }

    async generateAIFeatures(songData) {
<<<<<<< HEAD
        if (!process.env.OPENAI_API_KEY) {
            return 'Enhanced with AI features';
        }

        try {
            const { default: OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                    role: "user",
                    content: `Create a brief, engaging description for this Suno song: "${songData.title}". Make it 1-2 sentences, focusing on the musical style and mood. Be creative but concise.`
                }],
                max_tokens: 100
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            logger.error('AI generation failed', error);
            return 'Enhanced with AI features';
        }
    }

    async postToDiscord(title, url, description = '') {
        try {
            const channel = await this.client.channels.fetch(config.discord.channelId);
            
            if (!channel) {
                throw new Error('Discord channel not found');
            }

            let message = `🎵 **New Suno song:** ${title}\n${url}`;
            
            if (description) {
                message += `\n\n💭 ${description}`;
            }

            await channel.send(message);
            logger.info(`Posted song to Discord: ${title}`);
        } catch (error) {
            logger.error('Failed to post to Discord', error);
=======
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: `Generate content for this song: "${songData.title}". Return JSON with "description" (2 sentences) and "hashtags" (6 tags without #).`
                }],
                response_format: { type: "json_object" },
                max_tokens: 200
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            logger.error('AI generation error:', error.message);
            throw error;
        }
    }

    async postToDiscord(title, url, description = '', hashtags = []) {
        try {
            const channel = await this.client.channels.fetch(config.discord.channelId);
            
            let message = `🎵 New Suno song: ${title} — ${url}`;
            
            if (description) {
                message += `\n\n${description}`;
            }
            
            if (hashtags && hashtags.length > 0) {
                message += `\n\n${hashtags.map(tag => `#${tag}`).join(' ')}`;
            }

            await channel.send(message);
            logger.info(`Successfully posted song: ${title}`);
        } catch (error) {
            logger.error('Discord posting error:', error);
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
            throw error;
        }
    }

    generateSongId(url) {
<<<<<<< HEAD
        return url.split('/').pop() || Math.random().toString(36).substr(2, 9);
    }

    renderDashboard(stats, recentSongs) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Suno Discord Bot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            color: white;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.9);
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            color: #333;
        }
        
        .status.ready {
            background: rgba(34, 197, 94, 0.9);
            color: white;
        }
        
        .card {
            background: white;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #374151;
        }
        
        input, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .button-group {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        
        button {
            flex: 1;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
            min-width: 140px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }
        
        .btn-extract {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .history {
            margin-top: 30px;
        }
        
        .history h3 {
            margin-bottom: 20px;
            color: #374151;
            font-size: 1.5rem;
        }
        
        .song-item {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            transition: all 0.3s;
        }
        
        .song-item:hover {
            background: #f3f4f6;
            transform: translateY(-1px);
        }
        
        .song-title {
            font-weight: 600;
            color: #111827;
            margin-bottom: 4px;
        }
        
        .song-link {
            color: #667eea;
            text-decoration: none;
            font-size: 14px;
            word-break: break-all;
        }
        
        .song-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            font-size: 12px;
            color: #6b7280;
        }
        
        .share-again {
            padding: 4px 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
        }
        
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #6b7280;
        }
        
        .message {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        
        .message.success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #a7f3d0;
        }
        
        .message.error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .button-group {
                flex-direction: column;
            }
            
            button {
                min-width: auto;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎵 Suno Discord Bot</h1>
            <div class="status ${stats.isReady ? 'ready' : ''}">
                <span>●</span>
                ${stats.isReady ? 'Ready' : 'Connecting...'}
            </div>
        </div>
        
        <div class="message" id="message"></div>
        
        <div class="card">
            <h2 style="margin-bottom: 20px; color: #374151;">Post New Song</h2>
            
            <form id="songForm">
                <div class="form-group">
                    <label for="url">Suno Song URL *</label>
                    <input type="url" id="url" name="url" placeholder="https://suno.com/song/..." required>
                </div>
                
                <div class="form-group">
                    <label for="title">Song Title *</label>
                    <input type="text" id="title" name="title" placeholder="Enter song title or auto-extract" required>
                </div>
                
                <div class="form-group">
                    <label for="description">Description (Optional)</label>
                    <textarea id="description" name="description" rows="3" placeholder="Add a custom description or let AI generate one"></textarea>
                </div>
                
                <div class="button-group">
                    <button type="button" class="btn-extract" onclick="extractSong()">🎯 Auto-Extract</button>
                    <button type="submit" class="btn-primary">🚀 Post Song</button>
                    <button type="submit" class="btn-secondary" onclick="submitWithAI(event)">✨ Post with AI</button>
                </div>
            </form>
        </div>
        
        <div class="loading" id="loading">
            <div>⏳ Processing your request...</div>
        </div>
        
        ${recentSongs.length > 0 ? `
        <div class="card history">
            <h3>🎵 Recent Songs (${stats.totalSongs} total)</h3>
            ${recentSongs.map(song => `
                <div class="song-item">
                    <div class="song-title">${song.title}</div>
                    <a href="${song.url}" target="_blank" class="song-link">${song.url}</a>
                    <div class="song-meta">
                        <span>${new Date(song.timestamp).toLocaleDateString()}</span>
                        <button class="share-again" onclick="shareAgain('${song.id}')">🔄 Share Again</button>
                    </div>
                </div>
            `).join('')}
        </div>
        ` : ''}
    </div>
    
    <script>
        function showMessage(text, type) {
            const message = document.getElementById('message');
            message.textContent = text;
            message.className = 'message ' + type;
            message.style.display = 'block';
            setTimeout(() => {
                message.style.display = 'none';
            }, 5000);
        }
        
        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }
        
        async function extractSong() {
            const url = document.getElementById('url').value;
            if (!url) {
                showMessage('Please enter a Suno URL first', 'error');
                return;
            }
            
            showLoading(true);
            try {
                const response = await fetch('/extract-song', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                if (data.title) {
                    document.getElementById('title').value = data.title;
                    showMessage('Song title extracted successfully!', 'success');
                } else {
                    showMessage('Could not extract title automatically', 'error');
                }
            } catch (error) {
                showMessage('Failed to extract song data', 'error');
            }
            showLoading(false);
        }
        
        function submitWithAI(event) {
            event.preventDefault();
            document.getElementById('songForm').dispatchEvent(new Event('submit'));
            document.querySelector('input[name="useAI"]')?.remove();
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'useAI';
            input.value = 'true';
            document.getElementById('songForm').appendChild(input);
        }
        
        document.getElementById('songForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            if (!data.url || !data.title) {
                showMessage('URL and title are required', 'error');
                return;
            }
            
            showLoading(true);
            try {
                const response = await fetch('/post-song', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                if (result.success) {
                    showMessage(result.message, 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showMessage(result.error || 'Failed to post song', 'error');
                }
            } catch (error) {
                showMessage('Network error occurred', 'error');
            }
            showLoading(false);
        });
        
        async function shareAgain(songId) {
            showLoading(true);
            try {
                const response = await fetch(\`/share-again/\${songId}\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                if (result.success) {
                    showMessage(result.message, 'success');
                } else {
                    showMessage(result.error || 'Failed to share song', 'error');
                }
            } catch (error) {
                showMessage('Network error occurred', 'error');
            }
            showLoading(false);
        }
    </script>
</body>
</html>
        `;
    }
}

// Start the bot
const bot = new FinalSunoBot();
bot.start().catch(error => {
    logger.error('Failed to start bot', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down bot...');
    process.exit(0);
});
=======
        return url.split('/').pop()?.split('?')[0] || url;
    }

    successPage(title, message) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Success!</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 20px;
                    background: linear-gradient(135deg, #4ecdc4 0%, #26d0ce 100%);
                    min-height: 100vh;
                    color: white;
                    text-align: center;
                }
                .container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                }
                h1 { font-size: 3em; margin-bottom: 20px; }
                a {
                    display: inline-block;
                    padding: 15px 30px;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: bold;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎉</h1>
                <h2>${title}</h2>
                <p>${message}</p>
                <a href="/">← Post Another Song</a>
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
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 20px;
                    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                    min-height: 100vh;
                    color: white;
                    text-align: center;
                }
                .container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                }
                h1 { font-size: 3em; margin-bottom: 20px; }
                a {
                    display: inline-block;
                    padding: 15px 30px;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: bold;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>❌</h1>
                <p>${message}</p>
                <a href="/">← Go Back</a>
            </div>
        </body>
        </html>`;
    }
}

const bot = new FinalSunoBot();
bot.start();
>>>>>>> e23beec (Initialize Discord bot for Suno profile monitoring and content automation)
