const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

// Configuration with your Discord channel
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID || '1375419981658849342'
    }
};

// Simple logger
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};

class RenderSunoBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
        this.app = express();
        this.isReady = false;
        this.postedSongs = new Set();
        this.songHistory = [];
        
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
    }

    async start() {
        try {
            await this.client.login(config.discord.token);
            this.setupEventHandlers();
            this.setupWebServer();
            
            logger.info('🚀 Render Suno Bot started successfully!');
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
        // History API
        this.app.get('/history', (req, res) => {
            res.json(this.songHistory);
        });

        // Main dashboard
        this.app.get('/', (req, res) => {
            const hasAI = !!process.env.OPENAI_API_KEY;
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>🎵 Suno Discord Bot</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
                        
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        
                        body {
                            font-family: 'Inter', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            color: white;
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
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 40px 20px;
                        }
                        
                        .glass-card {
                            background: rgba(255, 255, 255, 0.1);
                            padding: 40px;
                            border-radius: 24px;
                            backdrop-filter: blur(20px);
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            margin-bottom: 30px;
                        }
                        
                        h1 {
                            text-align: center;
                            font-size: clamp(2.5rem, 5vw, 3.5rem);
                            font-weight: 800;
                            background: linear-gradient(45deg, #fff, #00d4ff);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            margin-bottom: 20px;
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
                            transition: all 0.3s ease;
                        }
                        
                        input:focus {
                            outline: none;
                            background: white;
                            border-color: #00d4ff;
                            box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.1);
                            transform: translateY(-2px);
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
                        
                        .btn-enhanced {
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
                            text-align: center;
                        }
                        
                        .status-info h3 {
                            color: #00d4ff;
                            margin-bottom: 15px;
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
                        
                        @media (max-width: 768px) {
                            .container { padding: 20px 15px; }
                            .glass-card { padding: 25px; }
                            h1 { font-size: 2.5rem; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="glass-card">
                            <h1>🎵 Suno Discord Bot</h1>
                            <p class="subtitle">Smart Music Posting Made Easy</p>
                            
                            ${hasAI ? `
                            <form method="POST" action="/post-song-enhanced">
                                <div class="ai-section">
                                    <h3 style="color: #00d4ff; margin-bottom: 15px;">🤖 Enhanced Posting</h3>
                                    <div class="form-group">
                                        <label for="enhanced-url">🔗 Paste your Suno link:</label>
                                        <input type="url" id="enhanced-url" name="url" required placeholder="https://suno.com/song/... or https://suno.com/s/...">
                                    </div>
                                    <div class="checkbox-group">
                                        <input type="checkbox" id="generateAI" name="generateAI" checked>
                                        <label for="generateAI">🧠 Generate AI description & hashtags</label>
                                    </div>
                                    <button type="submit" class="btn-enhanced">🚀 Enhanced Post</button>
                                </div>
                            </form>
                            <div class="or-divider">— OR —</div>
                            ` : ''}
                            
                            <form method="POST" action="/post-song-auto">
                                <div class="form-group">
                                    <label for="auto-url">⚡ Smart Auto-Post:</label>
                                    <input type="url" id="auto-url" name="url" required placeholder="https://suno.com/song/... or https://suno.com/s/...">
                                </div>
                                <button type="submit" class="btn-quick">⚡ Smart Auto-Post</button>
                            </form>

                            <div class="or-divider">— OR —</div>

                            <form method="POST" action="/post-song">
                                <div class="form-group">
                                    <label for="title">Song Title (manual):</label>
                                    <input type="text" id="title" name="title" required placeholder="Enter the song title...">
                                </div>
                                <div class="form-group">
                                    <label for="url">Suno URL:</label>
                                    <input type="url" id="url" name="url" required placeholder="https://suno.com/song/... or https://suno.com/s/...">
                                </div>
                                <button type="submit" class="btn-manual">🎵 Manual Post</button>
                            </form>
                        </div>
                        
                        <div class="glass-card">
                            <div class="status-info">
                                <h3>🎯 Bot Status</h3>
                                <p>🆕 <strong>Posting to your Discord server!</strong></p>
                                <p>AI Features: ${hasAI ? '✅ Connected & Ready!' : '❌ Not configured'}</p>
                                <p>Discord Bot: ✅ Active</p>
                                <p>Smart Extraction: ✅ Enhanced title detection</p>
                                <p>Duplicate Prevention: ✅ Won't post the same song twice</p>
                            </div>
                        </div>

                        <div class="glass-card" id="historySection">
                            <h3 style="color: #00d4ff; margin-bottom: 20px;">🎵 Recent Songs (Last 10)</h3>
                            <div id="songHistory">
                                <p style="opacity: 0.7;">Loading song history...</p>
                            </div>
                        </div>
                    </div>

                    <script>
                        // Load song history
                        async function loadHistory() {
                            try {
                                const response = await fetch('/history');
                                const history = await response.json();
                                const historyDiv = document.getElementById('songHistory');
                                
                                if (history.length === 0) {
                                    historyDiv.innerHTML = '<p style="opacity: 0.7;">No songs posted yet. Start sharing your music!</p>';
                                    return;
                                }

                                historyDiv.innerHTML = history.map(song => \`
                                    <div style="
                                        background: rgba(255, 255, 255, 0.1);
                                        border-radius: 12px;
                                        padding: 15px;
                                        margin: 10px 0;
                                        border: 1px solid rgba(255, 255, 255, 0.2);
                                    ">
                                        <h4 style="margin: 0 0 8px 0; color: #00d4ff;">\${song.title}</h4>
                                        <p style="margin: 5px 0; opacity: 0.8; font-size: 0.9em;">Posted: \${new Date(song.timestamp).toLocaleString()}</p>
                                        \${song.description ? \`<p style="margin: 8px 0; font-style: italic;">\${song.description}</p>\` : ''}
                                        \${song.hashtags && song.hashtags.length > 0 ? \`<p style="margin: 5px 0; color: #00d4ff;">\${song.hashtags.map(tag => '#' + tag).join(' ')}</p>\` : ''}
                                        <div style="margin-top: 10px;">
                                            <a href="\${song.url}" target="_blank" style="
                                                display: inline-block;
                                                background: linear-gradient(45deg, #00d4ff, #090979);
                                                color: white;
                                                padding: 8px 16px;
                                                border-radius: 8px;
                                                text-decoration: none;
                                                font-weight: 600;
                                                font-size: 0.9em;
                                                margin-right: 10px;
                                            ">🎵 Play on Suno</a>
                                        </div>
                                    </div>
                                \`).join('');
                            } catch (error) {
                                document.getElementById('songHistory').innerHTML = '<p style="color: #ff6b6b;">Error loading history</p>';
                            }
                        }

                        // Load history when page loads
                        window.addEventListener('load', loadHistory);
                    </script>
                </body>
                </html>
            `);
        });

        // Enhanced posting endpoint
        this.app.post('/post-song-enhanced', async (req, res) => {
            try {
                const { url, generateAI } = req.body;
                logger.info(`Enhanced posting request for: ${url}`);
                
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

                // Add to history
                this.addToHistory({
                    title: songData.title,
                    url: url,
                    description: songData.description || '',
                    hashtags: songData.hashtags || [],
                    timestamp: new Date().toISOString()
                });

                const message = generateAI && songData.description ? 
                    `🤖 "${songData.title}" posted with AI features!` :
                    `🎵 "${songData.title}" posted successfully!`;

                res.send(this.successPage(songData.title, message));
                
            } catch (error) {
                logger.error('Error in enhanced post:', error);
                res.send(this.errorPage('Failed to post song. Please check the URL and try again.'));
            }
        });

        // Smart auto posting
        this.app.post('/post-song-auto', async (req, res) => {
            try {
                const { url } = req.body;
                logger.info(`Smart auto posting request for: ${url}`);
                
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

                // Add to history
                this.addToHistory({
                    title: songData.title,
                    url: url,
                    description: '',
                    hashtags: [],
                    timestamp: new Date().toISOString()
                });

                res.send(this.successPage(songData.title, `🎵 "${songData.title}" posted successfully!`));
                
            } catch (error) {
                logger.error('Error in smart auto post:', error);
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

                // Add to history
                this.addToHistory({
                    title: title,
                    url: url,
                    description: '',
                    hashtags: [],
                    timestamp: new Date().toISOString()
                });

                res.send(this.successPage(title, `🎵 "${title}" posted successfully!`));
                
            } catch (error) {
                logger.error('Error in manual post:', error);
                res.send(this.errorPage('Failed to post song. Please check your Discord bot permissions.'));
            }
        });

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🌟 Render Suno Bot running on port ${PORT}`);
        }).on('error', (err) => {
            logger.error('Server error:', err);
        });
    }

    async extractSongData(url) {
        try {
            logger.info(`Smart extracting song data from: ${url}`);
            
            // Enhanced URL pattern extraction
            const urlPatterns = [
                /\/song\/([^\/\?#]+)/i,
                /\/s\/([^\/\?#]+)/i
            ];
            
            // Try web scraping with better headers
            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none'
                    },
                    timeout: 10000,
                    maxRedirects: 5
                });
                
                const html = response.data;
                
                // Enhanced extraction patterns
                const titlePatterns = [
                    /<meta\s+property="og:title"\s+content="([^"]{1,200})"/gi,
                    /<meta\s+name="twitter:title"\s+content="([^"]{1,200})"/gi,
                    /"name"\s*:\s*"([^"]{1,200})"/gi,
                    /<title[^>]*>([^<]{1,200})<\/title>/gi,
                    /<h1[^>]*>([^<]{1,200})<\/h1>/gi
                ];
                
                for (const pattern of titlePatterns) {
                    const matches = [...html.matchAll(pattern)];
                    for (const match of matches) {
                        if (match && match[1]) {
                            let title = match[1].trim();
                            
                            // Clean title
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
                                .replace(/^\s*["']+|["']+\s*$/g, '')
                                .trim();
                            
                            // Validate title
                            if (title && title.length >= 2 && title.length <= 150 && 
                                !title.toLowerCase().includes('loading') &&
                                !title.toLowerCase().includes('error') &&
                                title !== 'Suno') {
                                logger.info(`Successfully extracted title: ${title}`);
                                return { title };
                            }
                        }
                    }
                }
            } catch (webError) {
                logger.warn('Web scraping failed:', webError.message);
            }

            // Fallback: URL parsing
            for (const pattern of urlPatterns) {
                const match = url.match(pattern);
                if (match && match[1]) {
                    let title = decodeURIComponent(match[1])
                        .replace(/[-_+]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .trim();
                    
                    if (title && title.length >= 2 && title.length <= 100) {
                        logger.info(`Extracted title from URL: ${title}`);
                        return { title };
                    }
                }
            }

            logger.error('All extraction methods failed');
            return { title: '' };
            
        } catch (error) {
            logger.error('Error extracting song data:', error.message);
            return { title: '' };
        }
    }

    async generateAIFeatures(songData) {
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
            throw error;
        }
    }

    generateSongId(url) {
        return url.split('/').pop()?.split('?')[0] || url;
    }

    addToHistory(song) {
        this.songHistory.unshift(song);
        if (this.songHistory.length > 10) {
            this.songHistory = this.songHistory.slice(0, 10);
        }
        logger.info(`Added to history: ${song.title}`);
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

const bot = new RenderSunoBot();
bot.start();