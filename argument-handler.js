var child_process = require("child_process");
var exec = child_process.exec;
var uuid = require("node-uuid");
var fs = require("fs");
var Path = require("path");
var AzureMgt = require("azure-management-sdk-for-node");

module.exports = {
    openPortal: openPortal,
    downloadPublishSettings: downloadPublishSettings,
    getAzureMgt: getAzureMgt
};

/**
 * Open the Azure Management portal
 */
function openPortal(callback) {
    var cmd='open http://windows.azure.com';
    exec(cmd, function (err) {
        if (err) {
            callback(err);
            return;
        }
        callback();
    }); 
}

/**
 * Download the publish settings
*/
function downloadPublishSettings(callback) {
    var cmd='open https://windows.azure.com/download/publishprofile.aspx?client=nodejs&amp;lang=en'
    exec(cmd, function(err) {
        if (err) {
            callback(err);
            return;
        }
        callback();
    });
}

/**
 * Get an instance of AzureMgt based on the settings in a publishSettings file in the root of this app
 */
function getAzureMgt(settingsFile, subscriptionId, callback) {
    var files = fs.readdirSync("./");
    
    if (!settingsFile) {
        //find settings files
        var settingsFiles = files.filter(function(value, index, object) {
            if (value.match(/\.publishsettings$/)) {
                return true;
            }
        });
    
        //if not settings file was found then display an error
        if (settingsFiles.length == 0) {
            return callback("publish settings file (.publishsettings) is required in the root of the application," +
                    " or has to be set manually.");
        }
        
        //grab the first one
        settingsFile = settingsFiles[0];
    }
    
    // read it
    var sett = fs.readFileSync(settingsFile, "ascii");
    
    AzureMgt.getSubscriptionIds(sett, function (err, subscriptionIds) {
        if (err) return callback(err);
        
        if (!subscriptionIds.length) {
            return callback("No subscriptions found");
        }
        
        var _ = function () {
            getCertAndKey(sett, function (err, cert, key) {
                if (err) return callback(err);
                
                var azureMgt = new AzureMgt(sett, cert, key, true);
                callback(null, azureMgt, cert, key);
            });        
        };

        if (subscriptionIds.length > 1) {
            if (!subscriptionId) {
                return callback("Multiple subscription ids found. Please specify one with --subscription [id].\n" + JSON.stringify(subscriptionIds));
            }
            else {
                AzureMgt.normalizePublishSettings(sett, subscriptionId, function (err, newSett) {
                    if (err) return callback(err);
                    
                    _(newSett);
                });
            }
        }
        else {
            _(sett);
        }
    });
}

/**
 * Extract the private key from an Azure Management Certificate
 */
function getCertAndKey(sett, callback) {
    var file = Path.join(process.cwd(), "/build_temp/", uuid.v4() + ".key");
    
    AzureMgt.parsePublishSettings(sett, function (err, data) {
        if (err) return callback(err);
    
        var buffer = new Buffer(data.certificate, 'base64');
        
        fs.writeFile(file, buffer, function (err) {
            if (err) return callback(err);
            
            child_process.exec('openssl pkcs12 -in ' + file + ' -nodes -passin pass:', function (err, key) {
                if (err) return callback(err);
                
                fs.unlink(file);
                
                callback(null, key, key);
            });
        });
    });
}