var http = require('http');
http.createServer(function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/plain'
    });
    res.end('Brian is gek!\n');
}).listen(process.env.PORT, "0.0.0.0");