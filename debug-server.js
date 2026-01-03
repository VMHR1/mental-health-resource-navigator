// Simple HTTP server to receive debug logs from iPhone
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '.cursor', 'debug.log');

// Ensure .cursor directory exists
const cursorDir = path.dirname(LOG_FILE);
if (!fs.existsSync(cursorDir)) {
  fs.mkdirSync(cursorDir, { recursive: true });
}

const server = http.createServer((req, res) => {
  // Enable CORS for iPhone to send requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const logEntry = JSON.parse(body);
        const logLine = JSON.stringify(logEntry) + '\n';
        
        // Append to log file
        fs.appendFileSync(LOG_FILE, logLine);
        
        // Also print to console
        console.log(`[${new Date().toISOString()}] ${logEntry.message}`, logEntry.data || '');
        
        res.writeHead(200);
        res.end('OK');
      } catch (err) {
        console.error('Error processing log:', err);
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 8888;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔬 Debug server running on http://192.168.1.244:${PORT}`);
  console.log(`📱 Your iPhone can send logs to: http://192.168.1.244:${PORT}/log`);
  console.log(`📝 Logs will be saved to: ${LOG_FILE}`);
  console.log(`\nPress Ctrl+C to stop\n`);
});

