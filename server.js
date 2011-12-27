var fs = require("fs");
var AzureMgt = require("./azure-management");
require("uuid");
return;

var azureMgt = new AzureMgt(
                        fs.readFileSync("./elvis.publishsettings", "ascii"),
                        fs.readFileSync("./certificates/master.cer", "ascii"),
                        fs.readFileSync("./certificates/ca.key", "ascii")
                );


azureMgt.getHostedServices(function (services) {
    azureMgt.getDeployment(services[0], "production", function (deployment) {
        console.log(deployment);
    });
});







/*
var request = require("request");
var xml2js = require('xml2js');

request({
    url: "https://management.core.windows.net/9345d853-bcb4-49cb-980c-48aaca5cdc19/services/hostedservices",
    headers: {
        "x-ms-version": "2011-10-01"
    },
    cert: fs.readFileSync("./certificates/master.cer", "ascii"),
    key: fs.readFileSync("./certificates/ca.key", "ascii")
}, function (err, resp, body) {
    parseXml(body, function (obj) {
        console.log(obj);
    });
});

function parseXml(data, callback) {
    var parser = new xml2js.Parser();
    
    parser.on('end', function(result) {
        callback(result);
    });
    
    parser.parseString(data);
}

return;
*/