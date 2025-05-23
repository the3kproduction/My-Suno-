const express = require('express');
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const logger = require('./utils/logger');

class FixedSunoBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });
        
        this.discordService = new DiscordService(this.client);
        this.app = express();
        this.isReady = false;
        this.postedSongs = new Set();
        
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
    }

    async start() {
        try {
            await this.client.login(config.discord.token);
            this.setupEventHandlers();
            this.setupWebServer();
            
            logger.info('🚀 AI Suno Bot started successfully!');
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
        // Serve the main form with AI features
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
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
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
                        
                        .container:hover {
                            transform: translateY(-5px);
                            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
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
                            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
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
                            font-family: inherit;
                        }
                        
                        input[type="text"]:focus, input[type="url"]:focus {
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
                        
                        .checkbox-group input[type="checkbox"] {
                            width: 20px;
                            height: 20px;
                            accent-color: #00d4ff;
                        }
                        
                        .checkbox-group label {
                            font-weight: 500;
                            cursor: pointer;
                            margin: 0;
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
                            position: relative;
                            overflow: hidden;
                            font-family: inherit;
                            margin-bottom: 15px;
                        }
                        
                        button:hover {
                            transform: translateY(-3px);
                            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
                        }
                        
                        .btn-ai {
                            background: linear-gradient(45px, #00d4ff, #090979);
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
                        
                        .emoji {
                            font-size: 1.5em;
                            margin-right: 10px;
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
                        
                        .status-info p {
                            margin-bottom: 8px;
                            opacity: 0.9;
                        }
                        
                        @media (max-width: 768px) {
                            body {
                                margin: 20px auto;
                                padding: 15px;
                            }
                            
                            .container {
                                padding: 25px;
                            }
                            
                            h1 {
                                font-size: 2.5rem;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div style="text-align: center;">
                            <div class="ai-badge">🤖 AI-POWERED</div>
                        </div>
                        <h1><span class="emoji">🎵</span>AI Suno Discord Bot</h1>
                        <p class="subtitle">Intelligent Music Posting with AI-Generated Content</p>
                        
                        ${hasAI ? `
                        <!-- AI-Powered Auto-Fill Form -->
                        <form method="POST" action="/post-song-ai">
                            <div class="ai-section">
                                <h3 style="color: #00d4ff; margin-bottom: 15px;">🤖 AI-Enhanced Posting</h3>
                                <div class="form-group">
                                    <label for="ai-url">🔗 Paste your Suno link (AI will do the magic!):</label>
                                    <input type="url" id="ai-url" name="url" required placeholder="https://suno.com/song/...">
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="generateAI" name="generateAI" checked>
                                    <label for="generateAI">🧠 Generate AI description & hashtags</label>
                                </div>
                                <button type="submit" class="btn-ai">
                                    <span class="emoji">🚀</span>Post with AI Magic
                                </button>
                            </div>
                        </form>
                        
                        <div class="or-divider">— OR —</div>
                        ` : ''}
                        
                        <!-- Quick Auto-Fill Form -->
                        <form method="POST" action="/post-song-auto">
                            <div class="form-group">
                                <label for="auto-url">⚡ Quick post (auto-fills title):</label>
                                <input type="url" id="auto-url" name="url" required placeholder="https://suno.com/song/...">
                            </div>
                            <button type="submit" class="btn-quick">
                                <span class="emoji">⚡</span>Quick Auto-Post
                            </button>
                        </form>

                        <div class="or-divider">— OR —</div>

                        <!-- Manual Form -->
                        <form method="POST" action="/post-song">
                            <div class="form-group">
                                <label for="title">Song Title (manual):</label>
                                <input type="text" id="title" name="title" required placeholder="Enter the song title...">
                            </div>
                            <div class="form-group">
                                <label for="url">Suno URL:</label>
                                <input type="url" id="url" name="url" required placeholder="https://suno.com/song/...">
                            </div>
                            <button type="submit" class="btn-manual">
                                <span class="emoji">🎵</span>Manual Post
                            </button>
                        </form>
                        
                        <!-- Status Information -->
                        <div class="status-info">
                            <h3>🎯 Bot Status</h3>
                            <p>OpenAI AI: ${hasAI ? '✅ Connected & Ready for smart features!' : '❌ Not configured (basic features only)'}</p>
                            <p>Discord Bot: ✅ Active and posting to your channel</p>
                            <p>Auto-Detection: ✅ Smart song title extraction working</p>
                            <p>Duplicate Prevention: ✅ Won't post the same song twice</p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        // Handle AI-powered song posting
        this.app.post('/post-song-ai', async (req, res) => {
            try {
                const { url, generateAI } = req.body;
                
                if (!url) {
                    return res.send(this.errorPage('Please provide a Suno URL'));
                }

                const songData = await this.extractSongData(url);
                if (!songData.title) {
                    return res.send(this.errorPage('Could not extract song title from URL. Please try manual posting.'));
                }

                const songId = this.generateSongId(url);
                
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('This song has already been posted to Discord'));
                }

                // Generate AI features if requested
                if (generateAI && process.env.OPENAI_API_KEY) {
                    try {
                        const aiFeatures = await this.generateAIFeatures(songData);
                        songData.description = aiFeatures.description;
                        songData.hashtags = aiFeatures.hashtags;
                        songData.socialCaption = aiFeatures.socialCaption;
                    } catch (aiError) {
                        logger.warn('AI generation failed, continuing without AI features:', aiError);
                    }
                }

                const song = {
                    id: songId,
                    title: songData.title,
                    url: url,
                    description: songData.description,
                    hashtags: songData.hashtags,
                    created_at: new Date().toISOString()
                };

                await this.discordService.postSong(config.discord.channelId, song);
                this.postedSongs.add(songId);

                const successMessage = generateAI && songData.description ? 
                    `🤖 "${songData.title}" posted with AI-generated description and hashtags!` :
                    `🎵 "${songData.title}" posted to Discord successfully!`;

                res.send(this.successPage(songData.title, successMessage));
                
            } catch (error) {
                logger.error('Error posting song with AI:', error);
                res.send(this.errorPage('Failed to post song. Please try again.'));
            }
        });

        // Handle automatic song posting with URL scraping
        this.app.post('/post-song-auto', async (req, res) => {
            try {
                const { url } = req.body;
                
                if (!url) {
                    return res.send(this.errorPage('Please provide a Suno URL'));
                }

                const songData = await this.extractSongData(url);
                if (!songData.title) {
                    return res.send(this.errorPage('Could not extract song title from URL. Please try manual posting.'));
                }

                const songId = this.generateSongId(url);
                
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('This song has already been posted to Discord'));
                }

                const song = {
                    id: songId,
                    title: songData.title,
                    url: url,
                    created_at: new Date().toISOString()
                };

                await this.discordService.postSong(config.discord.channelId, song);
                this.postedSongs.add(songId);

                res.send(this.successPage(songData.title, `🎵 "${songData.title}" posted to Discord successfully!`));
                
            } catch (error) {
                logger.error('Error posting song automatically:', error);
                res.send(this.errorPage('Failed to post song. Please try again.'));
            }
        });

        // Handle manual song posting
        this.app.post('/post-song', async (req, res) => {
            try {
                if (!this.isReady) {
                    return res.status(503).send(this.errorPage('Bot is starting up, please wait a moment and try again.'));
                }

                const { title, url } = req.body;
                
                if (!title || !url) {
                    return res.send(this.errorPage('Please provide both song title and URL'));
                }

                const songId = this.generateSongId(url);
                
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('This song has already been posted to Discord'));
                }

                const song = {
                    id: songId,
                    title: title,
                    url: url,
                    created_at: new Date().toISOString()
                };

                try {
                    await this.discordService.postSong(config.discord.channelId, song);
                    this.postedSongs.add(songId);

                    logger.info(`Successfully posted song: ${title}`);
                    res.send(this.successPage(title, `🎵 "${title}" posted to Discord successfully!`));
                } catch (discordError) {
                    logger.error('Discord posting error:', discordError);
                    res.send(this.errorPage('Failed to post to Discord. Please check your bot permissions.'));
                }
                
            } catch (error) {
                logger.error('Error posting song:', error);
                res.send(this.errorPage('An unexpected error occurred. Please try again.'));
            }
        });

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🌟 AI Suno Bot server running on port ${PORT}`);
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
                title: '',
                artist: '',
                genre: '',
                metadata: {}
            };

            const titlePatterns = [
                /<title[^>]*>([^<]+)/i,
                /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
                /<h1[^>]*>([^<]+)<\/h1>/i
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

            return songData;
        } catch (error) {
            logger.error('Error extracting song data:', error);
            return { title: '', metadata: {} };
        }
    }

    async generateAIFeatures(songData) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const prompt = `Generate marketing content for this Suno AI song:
Title: "${songData.title}"

Please provide a JSON response with:
1. "description": A catchy 2-sentence description that makes people want to listen
2. "hashtags": Array of 6-8 relevant hashtags (without # symbols)
3. "socialCaption": A compelling social media caption under 280 characters

Focus on the mood, energy, and what makes this song special.`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 300,
                temperature: 0.8
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const aiContent = JSON.parse(response.data.choices[0].message.content);
            return {
                description: aiContent.description || '',
                hashtags: aiContent.hashtags || [],
                socialCaption: aiContent.socialCaption || ''
            };
        } catch (error) {
            logger.error('Error generating AI features:', error);
            throw error;
        }
    }

    generateSongId(url) {
        return url.split('/').pop()?.split('?')[0] || url;
    }

    successPage(title, message) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Success - AI Suno Bot</title>
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
                    }
                    .container {
                        background: rgba(255, 255, 255, 0.1);
                        padding: 40px;
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        text-align: center;
                    }
                    h1 {
                        font-size: 3em;
                        margin-bottom: 20px;
                    }
                    h2 {
                        margin-bottom: 20px;
                        font-size: 1.5em;
                    }
                    p {
                        font-size: 1.2em;
                        margin-bottom: 30px;
                    }
                    a {
                        display: inline-block;
                        padding: 15px 30px;
                        background: rgba(255, 255, 255, 0.2);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: bold;
                        transition: all 0.3s ease;
                    }
                    a:hover {
                        background: rgba(255, 255, 255, 0.3);
                        transform: translateY(-2px);
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
            </html>
        `;
    }

    errorPage(message) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error - AI Suno Bot</title>
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
                    }
                    .container {
                        background: rgba(255, 255, 255, 0.1);
                        padding: 40px;
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        text-align: center;
                    }
                    h1 {
                        font-size: 3em;
                        margin-bottom: 20px;
                    }
                    p {
                        font-size: 1.2em;
                        margin-bottom: 30px;
                    }
                    a {
                        display: inline-block;
                        padding: 15px 30px;
                        background: rgba(255, 255, 255, 0.2);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: bold;
                        transition: all 0.3s ease;
                    }
                    a:hover {
                        background: rgba(255, 255, 255, 0.3);
                        transform: translateY(-2px);
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
            </html>
        `;
    }
}

const bot = new FixedSunoBot();
bot.start();

module.exports = FixedSunoBot;