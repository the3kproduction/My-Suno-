const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

// Simple logger
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};

// Configuration
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID || '1375419981658849342'
    }
};

class RenderSunoBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
        this.app = express();
        this.isReady = false;
        this.postedSongs = new Set();
        this.songHistory = []; // Simple array for history
    }

    async start() {
        try {
            await this.client.login(config.discord.token);
            logger.info('Discord bot logged in successfully');
            
            this.setupEventHandlers();
            this.setupWebServer();
            
            this.isReady = true;
            logger.info('Bot is ready!');
        } catch (error) {
            logger.error('Failed to start bot', error);
        }
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            logger.info(`Logged in as ${this.client.user.tag}`);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error', error);
        });
    }

    setupWebServer() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Main page with beautiful interface
        this.app.get('/', (req, res) => {
            res.send(this.renderDashboard());
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
                
                // Add to history
                const song = {
                    id: this.generateSongId(url),
                    title,
                    url,
                    description: finalDescription,
                    timestamp: new Date().toISOString()
                };
                
                this.songHistory.unshift(song);
                this.songHistory = this.songHistory.slice(0, 50); // Keep last 50

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

        const PORT = process.env.PORT || 5000;
        this.app.listen(PORT, '0.0.0.0', () => {
            logger.info(`Web server running on port ${PORT}`);
        });
    }

    async extractSongData(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = response.data;
            let title = 'Unknown Song';

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
        }
    }

    async generateAIFeatures(songData) {
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
            throw error;
        }
    }

    generateSongId(url) {
        return url.split('/').pop() || Math.random().toString(36).substr(2, 9);
    }

    renderDashboard() {
        const recentSongs = this.songHistory.slice(0, 10);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Suno Discord Bot</title>
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
            background: rgba(34, 197, 94, 0.9);
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            color: white;
        }
        
        .card {
            background: white;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
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
            <div class="status">
                <span>●</span>
                ${this.isReady ? 'Ready' : 'Connecting...'}
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
            <h3>🎵 Recent Songs (${this.songHistory.length} total)</h3>
            ${recentSongs.map(song => `
                <div class="song-item">
                    <div class="song-title">${song.title}</div>
                    <a href="${song.url}" target="_blank" class="song-link">${song.url}</a>
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
    </script>
</body>
</html>
        `;
    }
}

// Start the bot
const bot = new RenderSunoBot();
bot.start().catch(error => {
    logger.error('Failed to start bot', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down bot...');
    process.exit(0);
});
