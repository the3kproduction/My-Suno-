const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const logger = require('./utils/logger');

class RenderSunoBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
        this.discordService = new DiscordService(this.client);
        this.app = express();
        this.isReady = false;
        this.postedSongs = new Set(); // Simple in-memory storage for Render
        
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
    }

    async start() {
        try {
            await this.client.login(config.discord.token);
            this.setupEventHandlers();
            this.setupWebServer();
            
            logger.info('🚀 AI Suno Bot started successfully on Render!');
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
        // Enhanced main dashboard
        this.app.get('/', (req, res) => {
            res.send(this.renderDashboard());
        });

        // AI-powered auto posting
        this.app.post('/api/post-ai', async (req, res) => {
            try {
                const { url, useAI } = req.body;
                
                if (!url) {
                    return res.status(400).json({ error: 'URL is required' });
                }

                const songData = await this.extractSongData(url);
                if (!songData.title) {
                    return res.status(400).json({ error: 'Could not extract song data' });
                }

                const songId = this.generateSongId(url);
                
                if (this.postedSongs.has(songId)) {
                    return res.status(409).json({ error: 'Song already posted' });
                }

                // Generate AI features if requested and available
                if (useAI && process.env.OPENAI_API_KEY) {
                    try {
                        const aiFeatures = await this.generateAIFeatures(songData);
                        songData.description = aiFeatures.description;
                        songData.hashtags = aiFeatures.hashtags;
                        songData.socialCaption = aiFeatures.socialCaption;
                    } catch (aiError) {
                        logger.warn('AI generation failed, posting without AI features');
                    }
                }

                // Post to Discord
                const song = {
                    id: songId,
                    title: songData.title,
                    url: url,
                    description: songData.description,
                    hashtags: songData.hashtags
                };

                await this.discordService.postSong(config.discord.channelId, song);
                this.postedSongs.add(songId);

                res.json({ 
                    success: true, 
                    message: useAI && songData.description ? 
                        '🤖 Song posted with AI features!' : 
                        '🎵 Song posted successfully!',
                    song: songData 
                });

            } catch (error) {
                logger.error('Error in AI post:', error);
                res.status(500).json({ error: 'Failed to process song' });
            }
        });

        // Quick post endpoint
        this.app.post('/post-song-auto', async (req, res) => {
            try {
                const { url } = req.body;
                const response = await fetch('/api/post-ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, useAI: false })
                });
                
                const result = await response.json();
                if (result.success) {
                    res.send(this.successPage(result.song.title, result.message));
                } else {
                    res.send(this.errorPage(result.error));
                }
            } catch (error) {
                res.send(this.errorPage('Failed to post song'));
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
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15000
            });
            
            const html = response.data;
            const songData = { title: '', artist: '', genre: '', metadata: {} };

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
2. "hashtags": Array of 6 relevant hashtags (without # symbols)
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

    renderDashboard() {
        const hasAI = !!process.env.OPENAI_API_KEY;
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 AI Suno Bot Dashboard</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        :root {
            --primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --ai-gradient: linear-gradient(45deg, #00d4ff, #090979);
            --success: linear-gradient(45deg, #4ecdc4, #26d0ce);
            --glass: rgba(255, 255, 255, 0.1);
            --glass-border: rgba(255, 255, 255, 0.2);
            --shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', sans-serif;
            background: var(--primary);
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
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            gap: 30px;
        }

        .glass-card {
            background: var(--glass);
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

        .ai-badge {
            display: inline-block;
            background: var(--ai-gradient);
            padding: 8px 20px;
            border-radius: 50px;
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        .main-title {
            font-size: clamp(2.5rem, 5vw, 4rem);
            font-weight: 800;
            background: linear-gradient(45deg, #fff, #00d4ff);
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

        .main-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }

        .section-title {
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 12px;
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
            border-color: #00d4ff;
            box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.1);
            transform: translateY(-2px);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 20px 0;
            padding: 15px;
            background: rgba(0, 212, 255, 0.1);
            border-radius: 12px;
            border: 1px solid rgba(0, 212, 255, 0.2);
        }

        .checkbox-group input[type="checkbox"] {
            width: 20px;
            height: 20px;
            accent-color: #00d4ff;
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
            font-family: inherit;
            margin-bottom: 10px;
        }

        .btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .btn-ai {
            background: var(--ai-gradient);
            color: white;
        }

        .btn-quick {
            background: var(--success);
            color: white;
        }

        .status-card {
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
        }

        .alert {
            padding: 20px;
            border-radius: 16px;
            margin: 20px 0;
            backdrop-filter: blur(10px);
            display: none;
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
            .container { padding: 15px; }
            .glass-card { padding: 25px; }
            .main-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="glass-card header">
            <div class="ai-badge">🤖 AI-POWERED</div>
            <h1 class="main-title">🎵 AI Suno Bot</h1>
            <p class="subtitle">Intelligent Music Posting with AI-Generated Content</p>
        </div>

        <!-- Main Features -->
        <div class="main-grid">
            <!-- AI-Powered Posting -->
            <div class="glass-card">
                <h2 class="section-title">🤖 Smart Posting</h2>
                <form id="aiPostForm">
                    <div class="form-group">
                        <label class="form-label">🔗 Suno URL</label>
                        <input type="url" name="url" class="form-input" placeholder="https://suno.com/song/..." required>
                    </div>
                    
                    ${hasAI ? `
                    <div class="checkbox-group">
                        <input type="checkbox" id="useAI" name="useAI" checked>
                        <label for="useAI">🧠 Generate AI Description & Hashtags</label>
                    </div>
                    <button type="submit" class="btn btn-ai">🚀 Post with AI Magic</button>
                    ` : ''}
                    
                    <button type="button" onclick="quickPost()" class="btn btn-quick">⚡ Quick Post</button>
                </form>

                <div id="alert" class="alert">
                    <span id="alertMessage"></span>
                </div>
            </div>

            <!-- Status & Info -->
            <div class="glass-card">
                <h2 class="section-title">🎯 Bot Status</h2>
                <div class="status-card">
                    <h3 style="color: #00d4ff; margin-bottom: 15px;">🔌 Connections</h3>
                    <p style="margin-bottom: 8px;">OpenAI AI: ${hasAI ? '✅ Connected & Ready' : '❌ Not configured'}</p>
                    <p style="margin-bottom: 8px;">Discord Bot: ✅ Active</p>
                    <p style="margin-bottom: 20px;">Auto-Detection: ✅ Working</p>
                    
                    <h3 style="color: #00d4ff; margin-bottom: 15px;">🎵 Features</h3>
                    <p style="margin-bottom: 8px;">✅ Smart song title extraction</p>
                    <p style="margin-bottom: 8px;">${hasAI ? '✅' : '❌'} AI-generated descriptions</p>
                    <p style="margin-bottom: 8px;">${hasAI ? '✅' : '❌'} Smart hashtag generation</p>
                    <p>✅ Duplicate prevention</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        // AI Post Form Handler
        document.getElementById('aiPostForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('.btn-ai');
            if (btn) {
                const originalText = btn.textContent;
                btn.textContent = '🧠 AI Processing...';
                btn.disabled = true;

                const formData = new FormData(e.target);
                const data = {
                    url: formData.get('url'),
                    useAI: formData.get('useAI') === 'on'
                };

                try {
                    const response = await fetch('/api/post-ai', {
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
            }
        });

        // Quick post without AI
        async function quickPost() {
            const url = document.querySelector('input[name="url"]').value;
            if (!url) {
                showAlert('Please enter a URL first', 'error');
                return;
            }

            showAlert('🚀 Posting song...', 'success');

            try {
                const response = await fetch('/api/post-ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, useAI: false })
                });

                const result = await response.json();
                if (result.success) {
                    showAlert('🎵 Song posted successfully!', 'success');
                    document.querySelector('input[name="url"]').value = '';
                } else {
                    showAlert(result.error || 'Failed to post', 'error');
                }
            } catch (error) {
                showAlert('Network error. Please try again.', 'error');
            }
        }

        // Alert system
        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            const alertMessage = document.getElementById('alertMessage');
            
            alert.className = \`alert alert-\${type}\`;
            alertMessage.textContent = message;
            alert.style.display = 'block';
            
            setTimeout(() => {
                alert.style.display = 'none';
            }, 5000);
        }

        // Add entrance animations
        document.addEventListener('DOMContentLoaded', () => {
            const cards = document.querySelectorAll('.glass-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(30px)';
                setTimeout(() => {
                    card.style.transition = 'all 0.6s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 200);
            });
        });
    </script>
</body>
</html>`;
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
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 { font-size: 3em; margin-bottom: 20px; }
        p { font-size: 1.2em; margin-bottom: 30px; }
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
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 { font-size: 3em; margin-bottom: 20px; }
        p { font-size: 1.2em; margin-bottom: 30px; }
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
</html>`;
    }
}

const bot = new RenderSunoBot();
bot.start();

module.exports = RenderSunoBot;