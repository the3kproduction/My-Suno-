# Suno Discord Bot

## Overview

This is a Discord bot that monitors a Suno profile for new songs and automatically posts them to a specified Discord channel. The bot periodically checks for new songs via the Suno API and posts formatted messages with song details to keep Discord users updated on new releases.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a modular Node.js architecture with clear separation of concerns:

- **Entry Point**: `index.js` serves as the main application orchestrator
- **Services Layer**: Handles external API interactions (Discord and Suno)
- **Utilities Layer**: Provides logging and file-based storage functionality
- **Configuration Layer**: Centralizes environment-based configuration management

The bot operates on a polling mechanism, periodically checking for new songs and maintaining state through JSON file storage.

## Key Components

### Core Application (`index.js`)
- **SunoDiscordBot Class**: Main orchestrator that coordinates all services
- **Event-driven Architecture**: Handles Discord client events and errors
- **Monitoring Loop**: Implements periodic checking for new songs

### Discord Service (`services/discordService.js`)
- **Rich Message Formatting**: Creates Discord embeds with song metadata
- **Fallback Messaging**: Gracefully degrades to simple messages if embeds fail
- **Channel Management**: Validates and interacts with Discord text channels

### Suno Service (`services/sunoService.js`)
- **API Integration**: Fetches latest songs from Suno's API
- **Multiple Endpoint Support**: Tries various API endpoint patterns for resilience
- **Error Handling**: Robust error handling with fallback mechanisms

### Storage System (`utils/storage.js`)
- **File-based Persistence**: Uses JSON files to track posted songs
- **Duplicate Prevention**: Maintains history to avoid reposting songs
- **Atomic Operations**: Ensures data consistency during read/write operations

### Logging System (`utils/logger.js`)
- **Configurable Log Levels**: Supports error, warn, info, and debug levels
- **Structured Output**: Consistent timestamp and level formatting
- **Environment-driven**: Log level configurable via environment variables

## Data Flow

1. **Initialization**: Bot starts up, loads configuration, and initializes storage
2. **Discord Connection**: Establishes connection to Discord using bot token
3. **Monitoring Loop**: Periodically polls Suno API for new songs
4. **Duplicate Check**: Compares fetched songs against stored history
5. **Message Posting**: Formats and posts new songs to Discord channel
6. **State Update**: Records posted songs to prevent duplicates

## External Dependencies

### Core Dependencies
- **discord.js v14**: Discord API interaction and bot functionality
- **axios**: HTTP client for Suno API communication
- **dotenv**: Environment variable management

### External Services
- **Discord API**: Bot authentication and message posting
- **Suno API**: Song data retrieval (multiple endpoint patterns supported)

## Deployment Strategy

### Environment Configuration
The application requires several environment variables:
- `DISCORD_TOKEN`: Bot authentication token
- `DISCORD_CHANNEL_ID`: Target channel for song posts
- `SUNO_PROFILE_ID`: Suno profile to monitor
- `SUNO_API_URL`: Suno API base URL (defaults to studio-api.suno.ai)
- `MONITORING_INTERVAL`: Check frequency in milliseconds (default: 5 minutes)
- `STORAGE_FILE_PATH`: JSON storage file location
- `LOG_LEVEL`: Logging verbosity (optional)

### Replit Deployment
- **Node.js 20 Runtime**: Configured for modern JavaScript features
- **Automatic Dependency Installation**: Handles npm package installation
- **Workflow Integration**: Supports parallel task execution
- **Environment Management**: Uses .env files for configuration

### File System Requirements
- **Data Directory**: Creates `./data/` for JSON storage
- **Persistent Storage**: Maintains song history across restarts
- **Graceful Initialization**: Creates required directories and files automatically

The architecture prioritizes reliability and maintainability, with robust error handling and clear separation between Discord operations, Suno API interactions, and data persistence.