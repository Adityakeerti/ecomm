const http = require('http');

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'localhost', port: 4000, path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    };
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log('--- Logging in ---');
  const login = await request('POST', '/admin/auth/login', {
    username: 'admin',
    password: 'admin123',
  });
  console.log('Login status:', login.status);
  const token = login.body.accessToken;

  console.log('--- GET /admin/overview ---');
  const overview = await request('GET', '/admin/overview', null, {
    Authorization: `Bearer ${token}`,
  });
  console.log('Overview status:', overview.status);
  console.log('Overview stats:', JSON.stringify(overview.body.stats, null, 2));
}

test().catch(console.error);
