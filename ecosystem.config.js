module.exports = {
  apps: [
    {
      name: 'malik-md',
      script: './index.js',

      // 24/7 NEVER STOP SETTINGS
      autorestart: true,
      max_restarts: 100,
      min_uptime: '10s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,

      // MEMORY MANAGEMENT
      max_memory_restart: '700M',
      node_args: '--max-old-space-size=768 --optimize-for-size --gc-interval=100',

      // ENVIRONMENT
      env: {
        NODE_ENV: 'production'
      },

      // LOGGING
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // PROCESS
      kill_timeout: 5000,
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      // IGNORE THESE FOR WATCH
      ignore_watch: ['node_modules', 'logs', 'session', 'temp', 'baileys_store.json']
    }
  ]
};
