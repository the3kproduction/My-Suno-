require('dotenv').config();

const config = {
    discord: {
        token: process.env.DISCORD_TOKEN || '',
        channelId: process.env.DISCORD_CHANNEL_ID || ''
    },
    suno: {
        profileId: process.env.SUNO_PROFILE_ID || '',
        apiUrl: process.env.SUNO_API_URL || 'https://studio-api.suno.ai'
    },
    monitoring: {
        interval: parseInt(process.env.MONITORING_INTERVAL) || 300000 // 5 minutes in milliseconds
    },
    storage: {
        filePath: process.env.STORAGE_FILE_PATH || './data/posted_songs.json'
    }
};

// Validate required configuration
const requiredFields = [
    'discord.token',
    'discord.channelId',
    'suno.profileId'
];

for (const field of requiredFields) {
    const value = field.split('.').reduce((obj, key) => obj[key], config);
    if (!value) {
        console.error(`Missing required configuration: ${field.toUpperCase().replace('.', '_')}`);
        process.exit(1);
    }
}

module.exports = config;
