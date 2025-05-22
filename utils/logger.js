class Logger {
    constructor() {
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = process.env.LOG_LEVEL ? 
            this.levels[process.env.LOG_LEVEL.toLowerCase()] || this.levels.info : 
            this.levels.info;
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedMessage = typeof message === 'string' ? message : JSON.stringify(message);
        const extraArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'string' ? arg : JSON.stringify(arg)
        ).join(' ') : '';
        
        return `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}${extraArgs}`;
    }

    error(message, ...args) {
        if (this.currentLevel >= this.levels.error) {
            console.error(this.formatMessage('error', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this.currentLevel >= this.levels.warn) {
            console.warn(this.formatMessage('warn', message, ...args));
        }
    }

    info(message, ...args) {
        if (this.currentLevel >= this.levels.info) {
            console.log(this.formatMessage('info', message, ...args));
        }
    }

    debug(message, ...args) {
        if (this.currentLevel >= this.levels.debug) {
            console.log(this.formatMessage('debug', message, ...args));
        }
    }
}

module.exports = new Logger();
