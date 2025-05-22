const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

class DiscordService {
    constructor(client) {
        this.client = client;
    }

    async postSong(channelId, song) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            
            if (!channel) {
                throw new Error(`Channel with ID ${channelId} not found`);
            }

            if (!channel.isTextBased()) {
                throw new Error(`Channel ${channelId} is not a text channel`);
            }

            // Create embed for better formatting
            const embed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle(`🎵 New Suno song: ${song.title}`)
                .setURL(song.audio_url || song.url)
                .setDescription(song.description || 'No description available')
                .addFields([
                    { name: 'Duration', value: this.formatDuration(song.duration), inline: true },
                    { name: 'Created', value: this.formatDate(song.created_at), inline: true }
                ])
                .setTimestamp();

            // Add thumbnail if available
            if (song.image_url) {
                embed.setThumbnail(song.image_url);
            }

            // Simple message format as fallback
            const message = `🎵 New Suno song: ${song.title} — ${song.audio_url || song.url}`;

            try {
                // Try to send embed first
                await channel.send({ embeds: [embed] });
            } catch (embedError) {
                // Fallback to simple message if embed fails
                logger.warn('Failed to send embed, falling back to simple message:', embedError);
                await channel.send(message);
            }

            logger.info(`Successfully posted song to Discord: ${song.title}`);
        } catch (error) {
            logger.error('Failed to post song to Discord:', error);
            throw error;
        }
    }

    formatDuration(duration) {
        if (!duration) return 'Unknown';
        
        if (typeof duration === 'number') {
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        return duration.toString();
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }
}

module.exports = DiscordService;
