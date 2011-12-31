var fs = require("fs");
var azure = require("azure-sdk-for-node");
var uuid = require("node-uuid");
var path = require("path");
var AzureMgt = require("./azure-management");
var packager = require("./azure-packager-node")

var azureMgt = new AzureMgt(
                        fs.readFileSync("./elvis.publishsettings", "ascii"),
                        fs.readFileSync("./certificates/master.cer", "ascii"),
                        fs.readFileSync("./certificates/ca.key", "ascii")
                );
var program = require('commander');

program
    .option('-s, --service [serviceName]', 'Hosted service name')
    .parse(process.argv);

if (program.service == null) {
    console.log('Hosted service name is required');
    return;
}

packager("./my-application", "./build_temp/" + uuid.v4(), function (file) {
    console.log("packaged @ " + file);
    
    uploadPackage(file, function (pkg) {
        console.log("package uploaded", pkg);
        
        fs.unlink(file, function () {
            console.log("package removed from filesystem");
        });
        
        publishPackage(pkg, program.service, function (err) {
            if (err) {
                console.log("publish error", err);
            }
            else {
                console.log("publish succeeded");
            }
        });
    });
});

/* === Helper functions === */

/**
 * Publish a .cspkg
 */
function publishPackage(pkg, service, callback) {
    console.log("creating service " + service);

    azureMgt.createServiceIfNotExists(service, function(err, deplId) {
        if (err) {
            callback(err);
            return;
        }
        checkStatus(deplId, createUpdateDeployment);
        //setTimeout(checkStatus(deplId, createUpdateDeployment), 1000);
    });



    function createUpdateDeployment(err) {
        console.log("starting deployment for " + service);
        if (err) {
            callback(err);
            return;
        }
        azureMgt.createUpdateDeployment(service, "production", pkg, function (err, deplId) {
            console.log("deployment started with id " + deplId);
            checkStatus(deplId, callback);
        });
    }

    function checkStatus(deplId, callback) {
        azureMgt.getStatus(deplId, function (err, finished) {
            if (!err && finished) {
                callback(null);
            }
            else if (err) {
                callback(err);
                return;
            }
            else {
                setTimeout(checkStatus(deplId, callback), 1000);
            }
        });
    }

}
/**
 * Upload a .cspkg file to Windows Azure Blob Storage
 */
function uploadPackage(file, callback) {
    azureMgt.getStorageServices(function (svc) {
        var name = svc[0].ServiceName;
        console.log("using storage service", name);
        azureMgt.getStorageCredentials(name, function (primaryKey) {
            
            var blobService = azure.createBlobService(name, primaryKey);
            blobService.createContainerIfNotExists('c9deploys', { publicAccessLevel : 'blob' }, function (err) {
                if (err) {
                    console.log("BlobService error", err);
                    return;
                }
                
                console.log("created container c9deploys");
                                
                var blobname = uuid.v4() + ".cspkg";
                console.log("preparing for upload '" + file + "' under blobname '" + blobname + "'");
                
                blobService.createBlockBlobFromFile("c9deploys", blobname, file, 11, function (err) {
                    if (err) {
                        console.log("BlobService error", err);
                        return;
                    }
                    
                    callback("http://" + name + ".blob.core.windows.net/c9deploys/" + blobname);
                });
            });
            
        });
    });
}