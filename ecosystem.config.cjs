const path = require('node:path');

module.exports = {
  apps: [{
    name: 'jarvis',
    cwd: path.join(__dirname, 'api'),
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env_production: { NODE_ENV: 'production' },
  }, {
    name: 'jarvis-terminal-input',
    cwd: path.join(__dirname, 'api'),
    script: 'src/terminalInputServer.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env_production: { NODE_ENV: 'production' },
  }, {
    name: 'jarvis-projects',
    cwd: path.join(__dirname, 'api'),
    script: 'src/projectsServer.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env_production: { NODE_ENV: 'production' },
  }],
};
