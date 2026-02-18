const http = require('http');

const data = JSON.stringify({
    sessionId: 'TEST-' + Date.now(),
    kioskId: 'K1',
    place: 'Margo City',
    isNewUser: true,
    amount: 10000,
    offerName: 'Test Transaction Script',
    transactionDate: new Date().toISOString()
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/customer-transaction',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('Sending test transaction to http://localhost:3000/api/customer-transaction ...');

const req = http.request(options, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);
    let responseBody = '';

    res.on('data', (d) => {
        responseBody += d;
    });

    res.on('end', () => {
        console.log('Response:', responseBody);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
