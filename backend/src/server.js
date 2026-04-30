require('dotenv').config();
const app = require('./app');
const os = require('os');

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 API Server Running`);
  console.log(`   Local:    http://localhost:${PORT}`);
  
  const networkInterfaces = os.networkInterfaces();
  const addresses = new Set();
  
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.add(iface.address);
      }
    });
  });
  
  addresses.forEach(addr => {
    console.log(`   Network:  http://${addr}:${PORT}`);
  });
  
  console.log('');
});
