var options = {
    host: 'management.core.windows.net',
    path: '/9345d853-bcb4-49cb-980c-48aaca5cdc19/services/hostedservices',
    port: 443,
    method: 'GET',
    cert: fs.readFileSync("./certificates/master.cer", "ascii"),
    key: fs.readFileSync("./certificates/ca.key", "ascii"),
    headers: {
        "x-ms-version": "2011-10-01"
    }
};

var req = https.request(options, function(res) {
	console.log("statusCode: ", res.statusCode);
	console.log("headers: ", res.headers);

	res.on('data', function(d) {
        process.stdout.write(d);
  	});
});

req.end();

req.on('error', function(e) {
	console.error(e);
});