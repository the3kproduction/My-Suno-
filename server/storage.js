const { pool } = require('./db');

class DatabaseStorage {
    async init() {
        // Initialize default channel if not exists
        await this.ensureDefaultChannel();
    }

    async ensureDefaultChannel() {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'SELECT id FROM channels WHERE discord_channel_id = $1',
                [process.env.DISCORD_CHANNEL_ID]
            );
            
            if (result.rows.length === 0) {
                await client.query(`
                    INSERT INTO channels (discord_channel_id, name, guild_id)
                    VALUES ($1, $2, $3)
                `, [
                    process.env.DISCORD_CHANNEL_ID,
                    'Default Channel',
                    'default'
                ]);
            }
        } finally {
            client.release();
        }
    }

    async addSong(songData) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                INSERT INTO songs (suno_id, title, url, artist, genre, mood, description, tags, duration, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (suno_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    url = EXCLUDED.url,
                    artist = EXCLUDED.artist,
                    genre = EXCLUDED.genre,
                    mood = EXCLUDED.mood,
                    description = EXCLUDED.description,
                    tags = EXCLUDED.tags,
                    duration = EXCLUDED.duration,
                    metadata = EXCLUDED.metadata
                RETURNING *
            `, [
                songData.sunoId,
                songData.title,
                songData.url,
                songData.artist || null,
                songData.genre || null,
                songData.mood || null,
                songData.description || null,
                JSON.stringify(songData.tags || []),
                songData.duration || null,
                JSON.stringify(songData.metadata || {})
            ]);
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async getSong(sunoId) {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM songs WHERE suno_id = $1', [sunoId]);
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async getAllSongs(limit = 50, offset = 0) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT * FROM songs 
                ORDER BY created_at DESC 
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            return result.rows;
        } finally {
            client.release();
        }
    }

    async getTopSongs(limit = 10) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT s.*, COUNT(ph.id) as post_count 
                FROM songs s
                LEFT JOIN post_history ph ON s.id = ph.song_id
                GROUP BY s.id
                ORDER BY s.play_count DESC, post_count DESC, s.likes DESC
                LIMIT $1
            `, [limit]);
            return result.rows;
        } finally {
            client.release();
        }
    }

    async recordPost(songId, channelId, discordMessageId) {
        const client = await pool.connect();
        try {
            // Get channel by discord_channel_id
            const channelResult = await client.query(
                'SELECT id FROM channels WHERE discord_channel_id = $1',
                [channelId]
            );
            
            if (channelResult.rows.length === 0) {
                throw new Error('Channel not found');
            }

            const dbChannelId = channelResult.rows[0].id;

            // Get song by suno_id
            const songResult = await client.query(
                'SELECT id FROM songs WHERE suno_id = $1',
                [songId]
            );

            if (songResult.rows.length === 0) {
                throw new Error('Song not found');
            }

            const dbSongId = songResult.rows[0].id;

            const result = await client.query(`
                INSERT INTO post_history (song_id, channel_id, discord_message_id)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [dbSongId, dbChannelId, discordMessageId]);

            // Update song posted_at timestamp
            await client.query(
                'UPDATE songs SET posted_at = NOW() WHERE id = $1',
                [dbSongId]
            );

            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async isAlreadyPosted(sunoId) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT ph.* FROM post_history ph
                JOIN songs s ON ph.song_id = s.id
                WHERE s.suno_id = $1
            `, [sunoId]);
            return result.rows.length > 0;
        } finally {
            client.release();
        }
    }

    async getAnalytics(timeframe = '7d') {
        const client = await pool.connect();
        try {
            let timeFilter = '';
            switch (timeframe) {
                case '24h':
                    timeFilter = "AND a.timestamp >= NOW() - INTERVAL '24 hours'";
                    break;
                case '7d':
                    timeFilter = "AND a.timestamp >= NOW() - INTERVAL '7 days'";
                    break;
                case '30d':
                    timeFilter = "AND a.timestamp >= NOW() - INTERVAL '30 days'";
                    break;
            }

            const result = await client.query(`
                SELECT 
                    COUNT(*) as total_events,
                    COUNT(DISTINCT s.id) as unique_songs,
                    a.event,
                    DATE_TRUNC('day', a.timestamp) as date
                FROM analytics a
                JOIN songs s ON a.song_id = s.id
                WHERE 1=1 ${timeFilter}
                GROUP BY a.event, DATE_TRUNC('day', a.timestamp)
                ORDER BY date DESC
            `);
            return result.rows;
        } finally {
            client.release();
        }
    }

    async recordEvent(songId, event, metadata = {}) {
        const client = await pool.connect();
        try {
            // Get song by suno_id
            const songResult = await client.query(
                'SELECT id FROM songs WHERE suno_id = $1',
                [songId]
            );

            if (songResult.rows.length === 0) {
                throw new Error('Song not found');
            }

            const dbSongId = songResult.rows[0].id;

            const result = await client.query(`
                INSERT INTO analytics (song_id, event, metadata)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [dbSongId, event, JSON.stringify(metadata)]);

            // Update play count if it's a play event
            if (event === 'play') {
                await client.query(
                    'UPDATE songs SET play_count = play_count + 1 WHERE id = $1',
                    [dbSongId]
                );
            }

            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async getStats() {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    (SELECT COUNT(*) FROM songs) as total_songs,
                    (SELECT COUNT(*) FROM post_history) as total_posts,
                    (SELECT COUNT(*) FROM channels WHERE is_active = true) as active_channels,
                    (SELECT SUM(play_count) FROM songs) as total_plays,
                    (SELECT COUNT(*) FROM songs WHERE posted_at >= NOW() - INTERVAL '24 hours') as songs_today,
                    (SELECT COUNT(*) FROM songs WHERE posted_at >= NOW() - INTERVAL '7 days') as songs_this_week
            `);
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    // Legacy compatibility methods
    async getPostedSongs() {
        const songs = await this.getAllSongs();
        return songs.filter(song => song.posted_at).map(song => ({
            id: song.suno_id,
            title: song.title,
            url: song.url,
            created_at: song.posted_at
        }));
    }

    async addPostedSong(song) {
        await this.addSong({
            sunoId: song.id,
            title: song.title,
            url: song.url
        });
        await this.recordPost(song.id, process.env.DISCORD_CHANNEL_ID, null);
    }

    async clearPostedSongs() {
        const client = await pool.connect();
        try {
            await client.query('DELETE FROM post_history');
            await client.query('DELETE FROM songs');
        } finally {
            client.release();
        }
    }
}

module.exports = DatabaseStorage;