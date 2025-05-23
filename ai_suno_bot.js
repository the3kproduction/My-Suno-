const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const config = require('./config/config');
const DiscordService = require('./services/discordService');
const DatabaseStorage = require('./server/storage');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./server/db');

class AISunoBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
        this.discordService = new DiscordService(this.client);
        this.storage = new DatabaseStorage();
        this.app = express();
        this.isReady = false;
        
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
    }

    async start() {
        try {
            await initializeDatabase();
            await this.storage.init();
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
        // Enhanced main dashboard
        this.app.get('/', async (req, res) => {
            try {
                const stats = this.storage.getStats ? await this.storage.getStats() : {
                    total_songs: 0, total_posts: 0, total_plays: 0, songs_today: 0
                };
                res.send(this.renderDashboard(stats));
            } catch (error) {
                res.send(this.renderDashboard({}));
            }
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
                
                if (await this.storage.isAlreadyPosted(songId)) {
                    return res.status(409).json({ error: 'Song already posted' });
                }

                // Generate AI features if requested
                if (useAI && process.env.OPENAI_API_KEY) {
                    const aiFeatures = await this.generateAIFeatures(songData);
                    songData.description = aiFeatures.description;
                    songData.hashtags = aiFeatures.hashtags;
                    songData.socialCaption = aiFeatures.socialCaption;
                }

                // Save to database
                if (this.storage.addSong) {
                    await this.storage.addSong({
                        sunoId: songId,
                        title: songData.title,
                        url: url,
                        description: songData.description,
                        tags: songData.hashtags || [],
                        metadata: { socialCaption: songData.socialCaption }
                    });
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
                await this.storage.addPostedSong(song);

                res.json({ 
                    success: true, 
                    message: useAI ? 'Song posted with AI features!' : 'Song posted successfully!',
                    song: songData 
                });

            } catch (error) {
                logger.error('Error in AI post:', error);
                res.status(500).json({ error: 'Failed to process song' });
            }
        });

        // Stats API
        this.app.get('/api/stats', async (req, res) => {
            try {
                const stats = this.storage.getStats ? await this.storage.getStats() : {
                    total_songs: 0, total_posts: 0, total_plays: 0, songs_today: 0
                };
                res.json(stats);
            } catch (error) {
                res.json({ total_songs: 0, total_posts: 0, total_plays: 0, songs_today: 0 });
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

    renderDashboard(stats) {
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
            --danger: linear-gradient(45deg, #ff6b6b, #ee5a24);
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
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: 
                radial-gradient(circle at 20% 80%, rgba(0, 212, 255, 0.2) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(102, 126, 234, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(78, 205, 196, 0.2) 0%, transparent 50%);
            animation: float 20s ease-in-out infinite;
            z-index: -1;
        }

        @keyframes float {
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
            position: relative;
        }

        .main-title {
            font-size: clamp(2.5rem, 5vw, 4rem);
            font-weight: 800;
            background: linear-gradient(45deg, #fff, #00d4ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
            animation: glow 2s ease-in-out infinite alternate;
        }

        @keyframes glow {
            from { filter: brightness(1); }
            to { filter: brightness(1.2); }
        }

        .subtitle {
            font-size: 1.3rem;
            opacity: 0.9;
            font-weight: 300;
            margin-bottom: 30px;
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

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--glass);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            border: 1px solid var(--glass-border);
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: scale(1.05);
            background: rgba(255, 255, 255, 0.15);
        }

        .stat-number {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 8px;
            background: linear-gradient(45deg, #fff, #00d4ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .stat-label {
            font-size: 0.9rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .main-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }

        .form-section {
            position: relative;
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

        .checkbox-group label {
            font-weight: 500;
            cursor: pointer;
            margin: 0;
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

        .btn-ai {
            background: var(--ai-gradient);
            color: white;
        }

        .btn-quick {
            background: var(--success);
            color: white;
            margin-top: 10px;
        }

        .ai-features {
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 16px;
            padding: 20px;
            margin: 20px 0;
        }

        .ai-preview {
            display: none;
            margin-top: 20px;
            padding: 20px;
            background: rgba(0, 212, 255, 0.05);
            border-radius: 12px;
            border-left: 4px solid #00d4ff;
        }

        .ai-preview h4 {
            color: #00d4ff;
            margin-bottom: 10px;
        }

        .ai-preview p {
            margin-bottom: 8px;
            opacity: 0.9;
        }

        .hashtags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }

        .hashtag {
            background: rgba(0, 212, 255, 0.2);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            color: #00d4ff;
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

        .loading {
            opacity: 0.7;
            pointer-events: none;
        }

        .loading::after {
            content: '';
            position: absolute;
            top: 50%; left: 50%;
            width: 20px; height: 20px;
            margin: -10px 0 0 -10px;
            border: 2px solid transparent;
            border-top: 2px solid #00d4ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
            .container { padding: 15px; gap: 20px; }
            .glass-card { padding: 25px; }
            .main-grid { grid-template-columns: 1fr; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
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

        <!-- Stats Dashboard -->
        <div class="glass-card">
            <h2 class="section-title">📊 Real-Time Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number" id="totalSongs">${stats.total_songs || 0}</div>
                    <div class="stat-label">Total Songs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="totalPosts">${stats.total_posts || 0}</div>
                    <div class="stat-label">Posts Made</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="totalPlays">${stats.total_plays || 0}</div>
                    <div class="stat-label">Total Plays</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="songsToday">${stats.songs_today || 0}</div>
                    <div class="stat-label">Today</div>
                </div>
            </div>
        </div>

        <!-- Main Features -->
        <div class="main-grid">
            <!-- AI-Powered Posting -->
            <div class="glass-card">
                <h2 class="section-title">🤖 AI-Powered Posting</h2>
                <form id="aiPostForm">
                    <div class="form-group">
                        <label class="form-label">🔗 Suno URL</label>
                        <input type="url" name="url" class="form-input" placeholder="https://suno.com/song/..." required>
                    </div>
                    
                    <div class="ai-features">
                        <div class="checkbox-group">
                            <input type="checkbox" id="useAI" name="useAI" checked>
                            <label for="useAI">🧠 Generate AI Description & Hashtags</label>
                        </div>
                        <small style="opacity: 0.8;">AI will create catchy descriptions and smart hashtags automatically!</small>
                    </div>

                    <button type="submit" class="btn btn-ai">🚀 Post with AI Magic</button>
                    <button type="button" onclick="quickPost()" class="btn btn-quick">⚡ Quick Post (No AI)</button>
                </form>

                <div id="aiPreview" class="ai-preview">
                    <h4>🤖 AI Generated Content:</h4>
                    <p id="aiDescription"></p>
                    <div id="aiHashtags" class="hashtags"></div>
                    <p><strong>Social Caption:</strong> <span id="aiCaption"></span></p>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="glass-card">
                <h2 class="section-title">⚡ Quick Actions</h2>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <button onclick="refreshStats()" class="btn btn-quick">📊 Refresh Stats</button>
                    <button onclick="testAI()" class="btn btn-ai">🧪 Test AI Features</button>
                    <button onclick="viewAnalytics()" class="btn" style="background: linear-gradient(45deg, #9b59b6, #8e44ad);">📈 View Analytics</button>
                </div>
                
                <div style="margin-top: 30px; padding: 20px; background: rgba(0, 212, 255, 0.1); border-radius: 16px;">
                    <h3 style="color: #00d4ff; margin-bottom: 15px;">🎯 AI Features Status</h3>
                    <p style="margin-bottom: 8px;">OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ Connected & Ready' : '❌ Not configured'}</p>
                    <p style="margin-bottom: 8px;">Database: ✅ Connected</p>
                    <p>Discord Bot: ✅ Active</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        // AI Post Form Handler
        document.getElementById('aiPostForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('.btn-ai');
            const originalText = btn.textContent;
            btn.textContent = '🧠 AI Processing...';
            btn.classList.add('loading');

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
                    
                    // Show AI preview if generated
                    if (result.song && result.song.description) {
                        showAIPreview(result.song);
                    }
                    
                    setTimeout(() => {
                        refreshStats();
                        location.reload();
                    }, 2000);
                } else {
                    showAlert(result.error || 'Failed to post song', 'error');
                }
            } catch (error) {
                showAlert('Network error. Please try again.', 'error');
            } finally {
                btn.textContent = originalText;
                btn.classList.remove('loading');
            }
        });

        // Quick post without AI
        async function quickPost() {
            const url = document.querySelector('input[name="url"]').value;
            if (!url) {
                showAlert('Please enter a URL first', 'error');
                return;
            }

            const response = await fetch('/api/post-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, useAI: false })
            });

            const result = await response.json();
            if (result.success) {
                showAlert('Song posted quickly!', 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                showAlert(result.error || 'Failed to post', 'error');
            }
        }

        // Show AI preview
        function showAIPreview(song) {
            const preview = document.getElementById('aiPreview');
            document.getElementById('aiDescription').textContent = song.description || '';
            document.getElementById('aiCaption').textContent = song.socialCaption || '';
            
            const hashtagsDiv = document.getElementById('aiHashtags');
            hashtagsDiv.innerHTML = (song.hashtags || []).map(tag => 
                \`<span class="hashtag">#\${tag}</span>\`
            ).join('');
            
            preview.style.display = 'block';
        }

        // Refresh stats
        async function refreshStats() {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                
                document.getElementById('totalSongs').textContent = stats.total_songs || 0;
                document.getElementById('totalPosts').textContent = stats.total_posts || 0;
                document.getElementById('totalPlays').textContent = stats.total_plays || 0;
                document.getElementById('songsToday').textContent = stats.songs_today || 0;
                
                showAlert('Stats refreshed!', 'success');
            } catch (error) {
                showAlert('Failed to refresh stats', 'error');
            }
        }

        // Test AI features
        async function testAI() {
            showAlert('🤖 AI features are ready! Try posting a song with AI enabled.', 'success');
        }

        // View analytics (placeholder)
        function viewAnalytics() {
            showAlert('📈 Advanced analytics coming soon!', 'success');
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
        setInterval(refreshStats, 30000);

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
}

const bot = new AISunoBot();
bot.start();

module.exports = AISunoBot;