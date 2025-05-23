const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

// Simple configuration
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID
    }
};

class SimpleSunoBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
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
            
            console.log('🚀 AI Suno Bot started successfully!');
        } catch (error) {
            console.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log(`🎵 Bot logged in as ${this.client.user.tag}`);
            this.isReady = true;
        });

        this.client.on('error', (error) => {
            console.error('Discord client error:', error);
        });
    }

    setupWebServer() {
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
                            <p>OpenAI AI: ${hasAI ? '✅ Connected & Ready!' : '❌ Not configured'}</p>
                            <p>Discord Bot: ✅ Active</p>
                            <p>Auto-Detection: ✅ Working</p>
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
                const songData = await this.extractSongData(url);
                
                if (!songData.title) {
                    return res.send(this.errorPage('Could not extract song title from URL'));
                }

                const songId = this.generateSongId(url);
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('Song already posted'));
                }

                // Generate AI features if requested
                if (generateAI && process.env.OPENAI_API_KEY) {
                    try {
                        const aiFeatures = await this.generateAIFeatures(songData);
                        songData.description = aiFeatures.description;
                        songData.hashtags = aiFeatures.hashtags;
                    } catch (aiError) {
                        console.warn('AI generation failed:', aiError);
                    }
                }

                await this.postToDiscord(songData.title, url, songData.description, songData.hashtags);
                this.postedSongs.add(songId);

                const message = generateAI && songData.description ? 
                    `🤖 "${songData.title}" posted with AI features!` :
                    `🎵 "${songData.title}" posted successfully!`;

                res.send(this.successPage(songData.title, message));
                
            } catch (error) {
                console.error('Error in AI post:', error);
                res.send(this.errorPage('Failed to post song'));
            }
        });

        // Quick auto posting
        this.app.post('/post-song-auto', async (req, res) => {
            try {
                const { url } = req.body;
                const songData = await this.extractSongData(url);
                
                if (!songData.title) {
                    return res.send(this.errorPage('Could not extract song title'));
                }

                const songId = this.generateSongId(url);
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('Song already posted'));
                }

                await this.postToDiscord(songData.title, url);
                this.postedSongs.add(songId);

                res.send(this.successPage(songData.title, `🎵 "${songData.title}" posted successfully!`));
                
            } catch (error) {
                console.error('Error in auto post:', error);
                res.send(this.errorPage('Failed to post song'));
            }
        });

        // Manual posting
        this.app.post('/post-song', async (req, res) => {
            try {
                const { title, url } = req.body;
                
                if (!title || !url) {
                    return res.send(this.errorPage('Please provide both title and URL'));
                }

                const songId = this.generateSongId(url);
                if (this.postedSongs.has(songId)) {
                    return res.send(this.errorPage('Song already posted'));
                }

                await this.postToDiscord(title, url);
                this.postedSongs.add(songId);

                res.send(this.successPage(title, `🎵 "${title}" posted successfully!`));
                
            } catch (error) {
                console.error('Error in manual post:', error);
                res.send(this.errorPage('Failed to post song'));
            }
        });

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌟 AI Suno Bot running on port ${PORT}`);
        });
    }

    async extractSongData(url) {
        try {
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
            console.log('Extracting from URL:', url);
            
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
                /<h2[^>]*>([^<]+)<\/h2>/i,
                // Fallback: look for song-like patterns in the URL
                /\/song\/([^\/\?]+)/i
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
                        console.log('Successfully extracted title:', title);
                        return { title };
                    }
                }
            }

            // If no title found, try to extract from URL
            const urlMatch = url.match(/\/song\/([^\/\?]+)/i);
            if (urlMatch) {
                const urlTitle = decodeURIComponent(urlMatch[1])
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                    .trim();
                
                if (urlTitle && urlTitle.length > 0) {
                    console.log('Extracted title from URL:', urlTitle);
                    return { title: urlTitle };
                }
            }

            console.log('No title found with any pattern');
            return { title: '' };
            
        } catch (error) {
            console.error('Error extracting song data:', error.message);
            
            // Fallback: try to extract something from the URL itself
            try {
                const urlMatch = url.match(/\/song\/([^\/\?]+)/i);
                if (urlMatch) {
                    const fallbackTitle = decodeURIComponent(urlMatch[1])
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .trim();
                    
                    if (fallbackTitle) {
                        console.log('Using fallback title from URL:', fallbackTitle);
                        return { title: fallbackTitle };
                    }
                }
            } catch (fallbackError) {
                console.error('Fallback extraction also failed:', fallbackError.message);
            }
            
            return { title: '' };
        }
    }

    async generateAIFeatures(songData) {
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
    }

    async postToDiscord(title, url, description = '', hashtags = []) {
        const channel = await this.client.channels.fetch(config.discord.channelId);
        
        let message = `🎵 New Suno song: ${title} — ${url}`;
        
        if (description) {
            message += `\n\n${description}`;
        }
        
        if (hashtags && hashtags.length > 0) {
            message += `\n\n${hashtags.map(tag => `#${tag}`).join(' ')}`;
        }

        await channel.send(message);
        console.log(`Posted song: ${title}`);
    }

    generateSongId(url) {
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

const bot = new SimpleSunoBot();
bot.start();