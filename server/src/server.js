const app = require('./app');
const { getPool } = require('./db');

const configuredPort = process.env.PORT;
const port = configuredPort === undefined ? 3000 : Number(configuredPort);

if (configuredPort !== undefined && (!/^\d+$/.test(configuredPort) || !Number.isInteger(port) || port < 1 || port > 65535)) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exitCode = 1;
} else {
  try {
    getPool();
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server listening on port ${port}`);
    });
    server.on('error', (error) => {
      console.error('Server failed to start:', error.code || 'unknown');
      process.exitCode = 1;
    });
  } catch (error) {
    console.error('Server configuration error:', error.message);
    process.exitCode = 1;
  }
}
