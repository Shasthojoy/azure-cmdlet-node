#!node

var fs = require("fs");
var uuid = require("node-uuid");
var AzureMgt = require("./azure-management");
var PublishHelper = require("./publish-helper");
var packager = require("./azure-packager-node");
var argumentHandler = require("./argument-handler");

var program = require('commander');

program
    .option('-p, --publish [serviceName]', 'publish the service')
    .option('-c, --cert', 'create X509 cert for the Azure mangement portal')
    .option('-po, --portal', 'opens the Azure management portal')
    .option('-d, --download', 'download publish settings')
    .option('-l, --locations', 'list all datacenter locations')
    .option('-de, --debug', 'output debug messages')
    .parse(process.argv);

if (program.cert) {
    argumentHandler.createCert(function(err) {
        if (err) {
            console.log(err);
        }
        console.log("copy the *.publishsettings file in your browser's download directory to azure publish tool folder");
    });
}
else if (program.portal) {
    argumentHandler.openPortal(function(err) {
        if (err) {
            console.log(err);
        }
    });
}
else if (program.download) {
    argumentHandler.downloadPublishSettings(function(err) {
        if (err) {
            console.log(err);
        }
    });
}
else if (program.locations) {
    var azureMgt = getAzureMgt();

    azureMgt.getDatacenterLocations(function (err, locs) {        
        var data = locs.join("\n");
        
        console.log(data);
    });
}
else if (program.publish) { 
    if (program.publish === true) {
        console.log("error: service name is required");
        return;
    }
    
    /* // you can update the config of a deployment like this:
    azureMgt.upgradeConfiguration(program.publish, "production", { instanceCount: 2 }, function (reqId) {
        azureMgt.monitorStatus(reqId, function (err) {
            console.log("config update", err);
        });
    });
    */
                    
    var azureMgt = getAzureMgt();
    var publish = new PublishHelper(azureMgt);
    return;
    azureMgt.getHostedServices(function () {
        console.log('tah dah', arguments);
    });
    return;
    
    console.log("creating package for './apps/" + program.publish + "'");
    packager("./apps/" + program.publish, "./build_temp/" + uuid.v4(), function (file) {
        publish.uploadPackage(file, function (err, pkg) {
            if (err) { 
                return console.log("uploadPackage failed", err);
            }
            
            console.log("package uploaded", pkg);
            
            fs.unlink(file, function () {
                console.log("package removed from filesystem");
            });
            
            // specify the (default) config settings, they will be set if a new deployment is created
            // otherwise use 'upgradeConfiguration([service], [slot], [config], [callback])'
            var defaultConfig = {
                operatingSystem: azureMgt.constants.OS.WIN2008_SP2,
                instanceCount: 1
            };
            
            publish.publishPackage(pkg, program.publish, defaultConfig, function (err) {
                if (err) {
                    return console.log("publish error", err);
                }
                else {
                    return console.log("publish succeeded");
                }
                
                publish.waitForServiceToBeStarted(program.publish, function (err, url) {
                    if (err) return console.log("waitForServiceToBeStarted failed");
                    
                    console.log("Service running and available on " + url);
                });
            });
        });
    });
}
else {
    console.log(program.helpInformation());
}

function getAzureMgt() {
    var files = fs.readdirSync("./");
    
    //find settings files
    var settingsFiles = files.filter(function(value, index, object) {
        if (value.match(/\.publishsettings$/)) {
            return true;
        }
    });

    //if not settings file was found then display an error
    if (settingsFiles.length == 0) {
        console.log("publish settings file (.publishsettings) is required. To download use azure -d");
        return;
    }

    //grab the first one
    var settingsFile = settingsFiles[0];
    console.log("using settings file:", settingsFile);
    
    var cert = fs.readFileSync("./certificates/ext/azure.pem", "ascii");
    var key = fs.readFileSync("./certificates/ext/azure.key", "ascii");
    var sett = fs.readFileSync(settingsFile, "ascii");
    
    getCertAndKey(sett, function (pvk) {
        var azureMgt = new AzureMgt(sett, cert, key, program.debug);
    });
    
    return azureMgt;
}

function getCertAndKey(sett, callback) {
    var proxy = "http://64.30.143.32:81/";
    
    var mgt = new AzureMgt(sett, null, null);
    mgt.parsePublishSettings(sett, function (err, data) {        
        if (err) return callback(err);
        
        require("request").post({ url: proxy, form: { ManagementCertificate: data.certificate } }, function (e, r, body) {
            if (e) return callback(e);
            
            var file = "./certificates/" + uuid.v4() + ".key";
            fs.writeFile(file, JSON.parse(body).privateKey, "ascii", function (err) {
                if (err) return callback(err);
                
                var cmds="openssl req -new -x509 -key " + file + " -days 1095 -batch";
                var exec = require("child_process").exec(cmds, function (err, blah) {
                    console.log(blah);
                });
            });
        });
    });
}