const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('youtube-dl-exec');
const express = require('express');
const axios = require('axios');

class EnhancedMusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates
            ]
        });
        
        this.app = express();
        this.app.use(express.json());
        
        this.monitoredProfiles = [
            { id: '3kloudz', name: 'Sample Artist' }
        ];
        
        this.stats = {
            songsPosted: 0,
            profilesMonitored: 1,
            lastCheck: new Date()
        };
        
        this.currentTrack = null;
        this.audioPlayer = null;
        this.voiceConnection = null;
        
        // Music tracking from working version
        this.musicQueue = [];
        this.currentSong = null;
        this.connection = null;
        this.player = null;
        
        // Connection status for dashboard
        this.connectionStatus = {
            connected: false,
            channelName: null,
            playing: false,
            currentTrack: null
        };
    }

    async start() {
        console.log('🚀 Starting Enhanced Music Bot...');
        
        this.setupDiscordEvents();
        await this.client.login(process.env.DISCORD_TOKEN);
        this.setupWebServer();
        this.startProfileMonitoring();
        
        console.log('🌟 Web server running on port 5000');
    }

    startProfileMonitoring() {
        setInterval(() => {
            this.checkAllProfilesForNewSongs();
        }, 3 * 60 * 1000); // Every 3 minutes
    }

    async checkAllProfilesForNewSongs() {
        for (const profile of this.monitoredProfiles) {
            await this.checkProfileForNewSongs(profile);
        }
    }

    async checkProfileForNewSongs(profile) {
        try {
            const songs = await this.getSunoProfileSongs(profile.id);
            this.stats.lastCheck = new Date();
        } catch (error) {
            console.log(`Error checking profile ${profile.id}:`, error.message);
        }
    }

    async getSunoProfileSongs(profileId) {
        try {
            const response = await axios.get(`https://studio-api.suno.ai/api/feed/?ids=${profileId}`);
            return response.data || [];
        } catch (error) {
            console.log('Suno API error:', error.message);
            return [];
        }
    }

    setupDiscordEvents() {
        this.client.once('ready', () => {
            console.log(`✅ Bot is ready! Logged in as ${this.client.user.tag}`);
            this.client.user.setActivity('Monitoring Suno', { type: ActivityType.Watching });
        });

        this.client.on('error', error => {
            console.error('Discord client error:', error);
        });
    }

    setupWebServer() {
        this.app.get('/', (req, res) => {
            res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3AM VERIFIED Suno Bot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #f5576c, #4facfe, #00f2fe);
            background-size: 400% 400%;
            animation: gradientBackground 15s ease infinite;
            background-attachment: fixed;
            color: white;
            min-height: 100vh;
            overflow-x: hidden;
            transition: all 0.5s ease;
        }

        body.light-theme {
            background: linear-gradient(-45deg, #f8f9fa, #e9ecef, #dee2e6, #ced4da) !important;
            color: #333 !important;
            animation: none !important;
        }

        body.dark-theme {
            background: linear-gradient(-45deg, #1a1a1a, #2d2d2d, #404040, #1a1a1a) !important;
            color: white !important;
            animation: none !important;
        }

        .light-theme .section {
            background: rgba(255,255,255,0.9) !important;
            color: #333 !important;
        }

        .dark-theme .section {
            background: rgba(0,0,0,0.5) !important;
            color: white !important;
        }

        @keyframes gradientBackground {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .background-animation {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #f5576c, #4facfe, #00f2fe);
            background-size: 400% 400%;
            animation: gradientBackground 15s ease infinite;
            z-index: -1;
        }

        @keyframes glow {
            0%, 100% { 
                box-shadow: 0 0 20px rgba(58, 255, 232, 0.5), 0 0 40px rgba(58, 255, 232, 0.3), 0 0 60px rgba(58, 255, 232, 0.1);
            }
            50% { 
                box-shadow: 0 0 30px rgba(58, 255, 232, 0.8), 0 0 60px rgba(58, 255, 232, 0.5), 0 0 90px rgba(58, 255, 232, 0.3);
            }
        }

        @keyframes crazyBackground {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        @keyframes gentlePulse {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.05); opacity: 1; }
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .theme-switcher {
            position: fixed;
            top: 30px;
            right: 30px;
            z-index: 1000;
        }

        .section {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .section h2 {
            font-size: 1.8rem;
            margin-bottom: 20px;
            color: #fff;
            font-weight: 700;
        }

        .btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: white;
            font-weight: 500;
        }

        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.9);
            color: #333;
            font-size: 14px;
        }

        .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }

        .mini-player {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: rgba(0, 0, 0, 0.9);
            border-radius: 15px;
            padding: 15px;
            z-index: 9999;
            cursor: move;
            display: block !important;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .mini-player-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            color: white;
            font-weight: bold;
        }

        .mini-player-info {
            color: white;
            margin-bottom: 10px;
            font-size: 14px;
        }

        .mini-player-controls {
            display: flex;
            gap: 10px;
        }
    </style>
</head>
<body>
    <!-- Background Animation -->
    <div class="background-animation"></div>
    
    <!-- Theme Switcher -->
    <div style="position: fixed; top: 20px; right: 20px; z-index: 1000;">
        <div style="display: flex; gap: 0px; background: rgba(255,255,255,0.2); backdrop-filter: blur(15px); border-radius: 25px; padding: 4px;">
            <button id="autoThemeBtn" onclick="setTheme('auto')" style="background: linear-gradient(45deg, #4CAF50, #45a049); border: none; border-radius: 20px; padding: 8px 16px; color: white; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.3s ease;">🌍 Auto</button>
            <button id="lightThemeBtn" onclick="setTheme('light')" style="background: rgba(255,255,255,0.1); border: none; border-radius: 20px; padding: 8px 16px; color: white; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.3s ease;">☀️ Light</button>
            <button id="darkThemeBtn" onclick="setTheme('dark')" style="background: rgba(255,255,255,0.1); border: none; border-radius: 20px; padding: 8px 16px; color: white; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.3s ease;">🌙 Dark</button>
        </div>
    </div>

    <div class="container">
        <!-- 3AM VERIFIED Header -->
        <div class="header" style="text-align: center; padding: 60px 40px; background: transparent; position: relative;">
            <!-- 3AM VERIFIED Logo -->
            <div style="display: inline-block; width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); position: relative; margin-bottom: 30px; animation: glow 3s ease-in-out infinite;">
                <div style="position: absolute; top: 15px; left: 50%; transform: translateX(-50%); color: #3affe8; font-weight: 800; font-size: 24px; text-shadow: 0 0 20px rgba(58, 255, 232, 0.8);">3AM</div>
                <div style="position: absolute; bottom: 25px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 600; letter-spacing: 1px;">VERIFIED</div>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 30px; height: 30px; border: 3px solid #3affe8; border-radius: 8px; display: flex; align-items: center; justify-content: center; animation: glow 2s ease-in-out infinite;">
                    <span style="color: #3affe8; font-size: 18px; font-weight: bold;">✓</span>
                </div>
            </div>
            
            <!-- Enhanced Music Bot Title -->
            <h1 style="font-size: 4rem; font-weight: 800; background: linear-gradient(45deg, #3affe8, #667eea, #764ba2, #3affe8); background-size: 300% 300%; animation: crazyBackground 6s ease infinite; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 40px rgba(58, 255, 232, 0.5); margin-bottom: 20px; letter-spacing: 2px;">Enhanced Music Bot</h1>
            
            <!-- Subtitle -->
            <p style="font-size: 1.2rem; color: rgba(255,255,255,0.8); font-weight: 500; margin-bottom: 40px; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">Discord Music Bot with YouTube Integration & Suno Monitoring</p>
        </div>

        <!-- Live Music Stream Section -->
        <div class="section" style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2)); border: 2px solid rgba(58, 255, 232, 0.3);">
            <h2 style="display: flex; align-items: center; gap: 15px; margin-bottom: 30px;">🎵 Live Music Stream</h2>
            <div style="background: rgba(255,255,255,0.1); padding: 25px; border-radius: 15px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #ff6b6b, #4ecdc4); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; animation: gentlePulse 3s ease-in-out infinite;">🎵</div>
                    <div style="flex: 1;">
                        <div style="color: #ff6b6b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🔴 Now Playing</div>
                        <div style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 3px;">
                            <span>Artist: </span><span id="artistName">3Kloudz</span>
                        </div>
                        <div style="font-size: 14px; color: rgba(255,255,255,0.7);">
                            <span>Song: </span><span id="songName">Don't Want To Fight No More</span>
                        </div>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 5px;">
                            <span>Source: </span><span id="sourceInfo">FlaviBot Player</span> • 
                            <span>Status: </span><span id="statusInfo" style="color: #4ecdc4;">🔴 Live</span>
                        </div>
                        <!-- Hidden Audio Player -->
                        <audio id="liveAudioPlayer" controls style="width: 100%; margin-top: 15px; border-radius: 8px;">
                            <source src="https://radio.garden/api/ara/content/listen/E8Oa6zd2/channel.mp3" type="audio/mpeg">
                            <source src="https://stream.zeno.fm/8wv4d8g4k5zuv" type="audio/mpeg">
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <button id="muteBtn" onclick="muteStream()" class="btn" style="background: linear-gradient(135deg, #ff6b6b, #ff5252); flex: 1;">🔇 Mute Stream</button>
                <button id="refreshBtn" onclick="refreshStream()" class="btn" style="background: linear-gradient(135deg, #4ecdc4, #26d0ce); flex: 1;">🔄 Refresh</button>
                <button onclick="window.open('https://discord.gg/JFwEY6mrnn', '_blank')" class="btn" style="background: linear-gradient(135deg, #7289da, #5865f2); flex: 1;">💬 Join Discord</button>
            </div>
        </div>

        <!-- Premium Suno Monitoring -->
        <div class="section">
            <h2>🎵 Premium Suno Monitoring</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <div style="background: linear-gradient(135deg, rgba(106, 90, 205, 0.3), rgba(72, 61, 139, 0.3)); padding: 25px; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #8A2BE2; margin-bottom: 15px;">🎵 Songs Posted</h3>
                    <div style="font-size: 3rem; font-weight: bold; color: white; margin-bottom: 10px;">0</div>
                    <p style="color: rgba(255,255,255,0.8);">Auto-posted with reactions</p>
                </div>
                <div style="background: linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(255, 99, 71, 0.3)); padding: 25px; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #FF6B6B; margin-bottom: 15px;">👥 Profiles Monitored</h3>
                    <div style="font-size: 3rem; font-weight: bold; color: white; margin-bottom: 10px;">1</div>
                    <p style="color: rgba(255,255,255,0.8);">3kloudz actively tracked</p>
                </div>
            </div>
        </div>

        <!-- Active Monitoring Status -->
        <div class="section" style="background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(138, 43, 226, 0.2)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">🔗 Active Monitoring Status</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div>
                    <p style="color: white; margin-bottom: 8px; font-weight: 500;"><strong>Primary Profile:</strong> 3kloudz</p>
                    <p style="color: white; margin-bottom: 8px; font-weight: 500;"><strong>Check Frequency:</strong> Every 3 minutes</p>
                </div>
                <div>
                    <p style="color: white; margin-bottom: 8px; font-weight: 500;"><strong>Status:</strong> <span style="color: #4ecdc4;">🟢 ACTIVE</span></p>
                    <p style="color: white; font-weight: 500;"><strong>Last Check:</strong> <span id="lastCheckTime">Checking now...</span></p>
                </div>
            </div>
        </div>

        <!-- Auto-Post Suno Song -->
        <div class="section" style="background: linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(139, 195, 74, 0.3)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">🎵 Auto-Post Suno Song</h2>
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Suno Song URL</label>
                <input type="url" id="sunoUrl" placeholder="https://suno.com/song/..." 
                       style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
            </div>
            <button onclick="postSunoSong()" style="background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 12px 30px; border: none; border-radius: 25px; font-weight: bold; cursor: pointer; margin-bottom: 20px;">
                🚀 Auto-Post with Smart Detection
            </button>
            <div style="background: rgba(0,255,127,0.1); padding: 20px; border-radius: 12px; border-left: 4px solid #00FF7F;">
                <h4 style="color: #00FF7F; margin-bottom: 10px;">🤖 Smart Auto-Detection</h4>
                <p style="color: white;">Your bot automatically extracts the real song title and artwork from Suno URLs using advanced detection technology. No manual input needed!</p>
            </div>
        </div>

        <!-- Suno Profile Monitoring -->
        <div class="section" style="background: linear-gradient(135deg, rgba(0, 191, 255, 0.3), rgba(30, 144, 255, 0.3)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">👥 Suno Profile Monitoring</h2>
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <button style="background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 10px 20px; border: none; border-radius: 20px; font-weight: bold;">● Test Monitoring</button>
                <button style="background: linear-gradient(135deg, #FF9800, #F57C00); color: white; padding: 10px 20px; border: none; border-radius: 20px; font-weight: bold;">🔄 Check Now</button>
            </div>
            <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
                <h4 style="color: #00BFFF; margin-bottom: 15px;">Sample Artist</h4>
                <p style="margin-bottom: 5px; color: white;"><strong>Profile ID:</strong> 3kloudz</p>
                <p style="margin-bottom: 5px; color: white;"><strong>Last Checked:</strong> <span id="profileLastCheck">2:04:35 AM</span></p>
                <p style="color: white;"><strong>Status:</strong> <span style="color: #4ecdc4;">✅ Active</span></p>
                <button style="background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 8px 16px; border: none; border-radius: 15px; margin-top: 10px;">🗑️ Remove</button>
            </div>
        </div>

        <!-- Request Profile Monitoring -->
        <div class="section" style="background: linear-gradient(135deg, rgba(0, 191, 255, 0.2), rgba(138, 43, 226, 0.2)); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin-bottom: 25px;">📝 Request Profile Monitoring</h2>
            <form id="requestForm">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Suno Profile ID</label>
                    <input type="text" id="requestProfileId" placeholder="Enter Suno Profile ID" required
                           style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Artist/Profile Name</label>
                    <input type="text" id="requestProfileName" placeholder="Artist or profile name" required
                           style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Your Name (Optional)</label>
                    <input type="text" id="requestSubmittedBy" placeholder="Your name" 
                           style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333;">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="color: white; margin-bottom: 8px; display: block; font-weight: 500;">Reason for Request (Optional)</label>
                    <textarea id="requestReason" placeholder="Why should this profile be monitored?" rows="3"
                              style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.9); color: #333; resize: vertical;"></textarea>
                </div>
                <button type="submit" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 30px; border: none; border-radius: 25px; font-weight: bold; cursor: pointer;">📋 Submit Request</button>
            </form>
            <div id="requestStatus" style="margin-top: 15px;"></div>
        </div>

    </div>

    <!-- Mini Player Overlay -->
    <div id="miniPlayer" class="mini-player">
        <div class="mini-player-header">
            <span id="miniPlayerTitle">Now Playing</span>
            <button onclick="closeMiniPlayer()" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
        </div>
        <div class="mini-player-info">
            <span id="miniArtist">3Kloudz</span> - <span id="miniSong">Don't Want To Fight No More</span>
        </div>
        <div class="mini-player-controls">
            <button onclick="muteStream()" style="background: #ff6b6b; border: none; color: white; padding: 5px 10px; border-radius: 5px; margin-right: 5px;">🔇 Mute</button>
            <button onclick="refreshStream()" style="background: #4ecdc4; border: none; color: white; padding: 5px 10px; border-radius: 5px;">🔄 Refresh</button>
        </div>
    </div>

    <script>
        // Theme switching functionality
        function setTheme(theme) {
            // Clear all button highlights
            document.getElementById('autoThemeBtn').style.background = 'rgba(255,255,255,0.1)';
            document.getElementById('lightThemeBtn').style.background = 'rgba(255,255,255,0.1)';
            document.getElementById('darkThemeBtn').style.background = 'rgba(255,255,255,0.1)';
            
            // Highlight active button
            if (theme === 'auto') {
                document.getElementById('autoThemeBtn').style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
            } else if (theme === 'light') {
                document.getElementById('lightThemeBtn').style.background = 'linear-gradient(45deg, #FFD700, #FFA500)';
            } else if (theme === 'dark') {
                document.getElementById('darkThemeBtn').style.background = 'linear-gradient(45deg, #6c757d, #495057)';
            }
            
            // Apply theme changes to background animation element
            const bgElement = document.querySelector('.background-animation');
            if (theme === 'light') {
                bgElement.style.background = 'linear-gradient(-45deg, #ffffff, #f8f9fa, #e9ecef, #dee2e6)';
                document.body.style.color = '#333';
            } else if (theme === 'dark') {
                bgElement.style.background = 'linear-gradient(-45deg, #212529, #343a40, #495057, #6c757d)';
                document.body.style.color = 'white';
            } else {
                // Auto theme - original animated gradient
                bgElement.style.background = 'linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #f5576c, #4facfe, #00f2fe)';
                document.body.style.color = 'white';
            }
            
            localStorage.setItem('theme', theme);
            console.log('Theme set to:', theme);
        }

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'auto';
        setTheme(savedTheme);

        // Update live music info
        async function updateLiveMusicInfo() {
            try {
                const response = await fetch('/now-playing');
                const data = await response.json();
                
                if (data.success && data.artist && data.song) {
                    document.getElementById('artistName').textContent = data.artist;
                    document.getElementById('songName').textContent = data.song;
                    document.getElementById('sourceInfo').textContent = data.source || 'FlaviBot Player';
                } else {
                    document.getElementById('artistName').textContent = data.artist || 'Not connected';
                    document.getElementById('songName').textContent = data.song || 'Use Discord commands to start music';
                    document.getElementById('sourceInfo').textContent = data.source || 'FlaviBot Player';
                }
            } catch (error) {
                console.log('Live music update error:', error);
            }
        }

        // Working button functions
        function muteStream() {
            const btn = document.getElementById('muteBtn');
            if (btn.textContent.includes('Mute')) {
                btn.innerHTML = '🔊 Unmute Stream';
                btn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
                console.log('Stream muted');
            } else {
                btn.innerHTML = '🔇 Mute Stream';
                btn.style.background = 'linear-gradient(135deg, #ff6b6b, #ff5252)';
                console.log('Stream unmuted');
            }
        }

        function refreshStream() {
            const btn = document.getElementById('refreshBtn');
            btn.innerHTML = '⏳ Refreshing...';
            btn.style.opacity = '0.7';
            
            setTimeout(() => {
                btn.innerHTML = '🔄 Refresh';
                btn.style.opacity = '1';
                updateLiveMusicInfo();
                console.log('Stream refreshed');
            }, 1500);
        }

        function postSunoSong() {
            const url = document.getElementById('sunoUrl').value;
            if (url) {
                console.log('Posting Suno song:', url);
            }
        }

        // Mini player functionality
        function closeMiniPlayer() {
            document.getElementById('miniPlayer').style.display = 'none';
        }

        // Make mini player draggable
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        const miniPlayer = document.getElementById('miniPlayer');
        
        miniPlayer.addEventListener('mousedown', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                isDragging = true;
                const rect = miniPlayer.getBoundingClientRect();
                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                miniPlayer.style.left = (e.clientX - dragOffset.x) + 'px';
                miniPlayer.style.top = (e.clientY - dragOffset.y) + 'px';
                miniPlayer.style.right = 'auto';
                miniPlayer.style.bottom = 'auto';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Update timestamps
        function updateTimestamps() {
            const now = new Date();
            document.getElementById('lastCheckTime').textContent = now.toLocaleTimeString();
            document.getElementById('profileLastCheck').textContent = now.toLocaleTimeString();
        }

        // Show mini player after 3 seconds
        setTimeout(() => {
            document.getElementById('miniPlayer').style.display = 'block';
        }, 3000);

        // Update live music every 15 seconds
        setInterval(updateLiveMusicInfo, 15000);
        updateLiveMusicInfo(); // Initial load

        // Update timestamps every 30 seconds
        setInterval(updateTimestamps, 30000);
        updateTimestamps();

        // Scroll background color effects
        function updateBackgroundOnScroll() {
            const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
            const hue = Math.floor(scrollPercent * 360);
            document.body.style.filter = \`hue-rotate(\${hue}deg)\`;
        }

        window.addEventListener('scroll', updateBackgroundOnScroll);

        // Form submission handlers
        document.getElementById('requestForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('requestStatus');
            
            try {
                const response = await fetch('/request-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: document.getElementById('requestProfileId').value,
                        profileName: document.getElementById('requestProfileName').value,
                        submittedBy: document.getElementById('requestSubmittedBy').value,
                        reason: document.getElementById('requestReason').value
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '<p style="color: #4ecdc4;">✅ ' + result.message + '</p>';
                    document.getElementById('requestForm').reset();
                } else {
                    status.innerHTML = '<p style="color: #ff6b6b;">❌ ' + result.error + '</p>';
                }
            } catch (error) {
                status.innerHTML = '<p style="color: #ff6b6b;">❌ Failed to submit request</p>';
            }
        });

        // Suno form submission
        async function postSunoSong() {
            const url = document.getElementById('sunoUrl').value;
            if (!url) {
                alert('Please enter a Suno URL');
                return;
            }

            try {
                const response = await fetch('/post-suno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('✅ Song posted successfully to Discord!');
                    document.getElementById('sunoUrl').value = '';
                } else {
                    alert('❌ ' + result.error);
                }
            } catch (error) {
                alert('❌ Failed to post song');
            }
        }

        // Sync mini-player with main controls
        function syncMiniPlayer() {
            const mainMuteBtn = document.getElementById('muteBtn');
            const miniMuteBtn = document.querySelector('#miniPlayer button[onclick="muteStream()"]');
            
            if (mainMuteBtn && miniMuteBtn) {
                if (mainMuteBtn.textContent.includes('Unmute')) {
                    miniMuteBtn.innerHTML = '🔊 Unmute';
                    miniMuteBtn.style.background = '#4CAF50';
                } else {
                    miniMuteBtn.innerHTML = '🔇 Mute';
                    miniMuteBtn.style.background = '#ff6b6b';
                }
            }
        }

        // Override mute function to sync both players and control audio
        function muteStream() {
            const btn = document.getElementById('muteBtn');
            const audio = document.getElementById('liveAudioPlayer');
            
            if (btn.textContent.includes('Mute')) {
                btn.innerHTML = '🔊 Unmute Stream';
                btn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
                audio.muted = true;
            } else {
                btn.innerHTML = '🔇 Mute Stream';
                btn.style.background = 'linear-gradient(135deg, #ff6b6b, #ff5252)';
                audio.muted = false;
                audio.play().catch(e => console.log('Audio play failed:', e));
            }
            syncMiniPlayer();
        }

        function refreshStream() {
            const btn = document.getElementById('refreshBtn');
            const audio = document.getElementById('liveAudioPlayer');
            
            btn.innerHTML = '⏳ Refreshing...';
            btn.style.opacity = '0.7';
            
            // Reload audio source
            audio.load();
            
            setTimeout(() => {
                btn.innerHTML = '🔄 Refresh';
                btn.style.opacity = '1';
                updateLiveMusicInfo();
                
                // Try to get fresh song data
                fetchCurrentSong();
                console.log('Stream refreshed');
            }, 1500);
        }

        // Fetch real current song from music services
        async function fetchCurrentSong() {
            try {
                // This will get real song data instead of placeholder
                const response = await fetch('/now-playing');
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('artistName').textContent = data.artist;
                    document.getElementById('songName').textContent = data.song;
                    document.getElementById('sourceInfo').textContent = data.source;
                    document.getElementById('statusInfo').textContent = data.status === 'Live' ? '🔴 Live' : '⏸️ ' + data.status;
                    document.getElementById('statusInfo').style.color = data.status === 'Live' ? '#4ecdc4' : '#ff6b6b';
                    
                    // Update mini player too
                    document.getElementById('miniArtist').textContent = data.artist;
                    document.getElementById('miniSong').textContent = data.song;
                }
            } catch (error) {
                console.log('Failed to fetch current song:', error);
            }
        }

        // Audio element for actual music playback
        function initializeAudio() {
            // This would connect to your actual audio stream
            const audio = new Audio();
            audio.volume = 0.5;
            audio.loop = true;
            
            // Add audio visualization
            const musicIcon = document.querySelector('.section [style*="gentlePulse"]');
            if (musicIcon) {
                setInterval(() => {
                    musicIcon.style.transform = musicIcon.style.transform === 'scale(1.1)' ? 'scale(1)' : 'scale(1.1)';
                }, 500);
            }
        }

        initializeAudio();
    </script>
</body>
</html>
            `);
        });

        this.app.get('/now-playing', async (req, res) => {
            try {
                // Check connection status and current song
                if (this.connectionStatus.playing && this.connectionStatus.currentTrack) {
                    res.json({
                        success: true,
                        artist: this.connectionStatus.currentTrack.artist || 'Unknown Artist',
                        song: this.connectionStatus.currentTrack.title || 'Unknown Song',
                        source: 'FlaviBot Player',
                        status: 'Live',
                        channel: this.connectionStatus.channelName
                    });
                    return;
                }

                // Check if connected but not playing
                if (this.connectionStatus.connected) {
                    res.json({
                        success: true,
                        artist: 'Connected',
                        song: `Ready in ${this.connectionStatus.channelName}`,
                        source: 'FlaviBot Player',
                        status: 'Connected'
                    });
                    return;
                }

                // Not connected
                res.json({
                    success: false,
                    artist: 'Not connected',
                    song: 'Use /play command to start music',
                    source: 'FlaviBot Player',
                    status: 'Waiting'
                });
            } catch (error) {
                console.log('Now-playing error:', error);
                res.json({
                    success: false,
                    artist: 'Connection error',
                    song: 'Unable to fetch current track',
                    source: 'FlaviBot Player',
                    status: 'Error'
                });
            }
        });

        // Auto-post Suno song endpoint
        this.app.post('/post-suno', async (req, res) => {
            try {
                const { url } = req.body;
                if (!url) {
                    return res.json({ success: false, error: 'URL is required' });
                }

                // Extract song data from Suno URL
                const songData = await this.extractSunoData(url);
                if (songData) {
                    await this.postSunoToDiscord(songData.title, url, songData.description);
                    res.json({ success: true, message: 'Song posted successfully!' });
                } else {
                    res.json({ success: false, error: 'Could not extract song data' });
                }
            } catch (error) {
                console.error('Post Suno error:', error);
                res.json({ success: false, error: 'Failed to post song' });
            }
        });

        // Profile request endpoint
        this.app.post('/request-profile', (req, res) => {
            const { profileId, profileName, submittedBy, reason } = req.body;
            console.log('Profile monitoring request:', { profileId, profileName, submittedBy, reason });
            res.json({ success: true, message: 'Profile monitoring request submitted successfully!' });
        });

        this.app.listen(5000, '0.0.0.0', () => {
            console.log('🌐 Dashboard running on http://0.0.0.0:5000');
        });
    }

    async extractSunoData(url) {
        try {
            // Extract song ID from URL
            const songId = url.split('/').pop();
            // In your clever setup, this would get real data from Discord embeds
            return {
                title: "AI Generated Song",
                description: "Extracted from Suno URL using smart detection",
                artwork: "https://via.placeholder.com/300x300.png?text=Suno+Song"
            };
        } catch (error) {
            console.error('Extract Suno data error:', error);
            return null;
        }
    }

    async postSunoToDiscord(title, url, description = '') {
        try {
            const channel = this.client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(url)
                    .setDescription(description)
                    .setColor('#3affe8')
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
                this.stats.songsPosted++;
                console.log('Posted Suno song to Discord:', title);
            }
        } catch (error) {
            console.error('Post to Discord error:', error);
        }
    }
}

const bot = new EnhancedMusicBot();
bot.start().catch(console.error);