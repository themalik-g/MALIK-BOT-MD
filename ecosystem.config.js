module.exports = {
    apps: [{
        name: 'malik-bot',
        script: './index.js',
        instances: 1,
        exec_mode: 'fork',
        max_memory_restart: '220M',
        env: {
            NODE_ENV: 'production',
            NODE_OPTIONS: '--max-old-space-size=192 --optimize-for-size --gc-interval=100'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        autorestart: true,
        restart_delay: 5000,
        max_restarts: 20,
        min_uptime: '10s',
        kill_timeout: 5000,
        listen_timeout: 10000,
        wait_ready: false
    }]
}
