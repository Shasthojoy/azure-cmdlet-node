var uuid = require("node-uuid");
var azure = require("azure-sdk-for-node");

module.exports = PublishHelper;

function PublishHelper(azureMgt, onProgress) {
    
    function log () {
        console.log.apply(this, arguments);
    }
    
    /**
     * Publish a .cspkg
     */
    function publishPackage(pkg, service, config, callback) {
        log("creating service " + service);
    
        azureMgt.createServiceIfNotExists(service, config, function(err, deplId) {
            if (err) {
                return callback(err);
            }
            
            log("starting deployment for " + service);

            azureMgt.createUpdateDeployment(service, "production", pkg, config, function (err, deplId) {
                if (err) {
                    if (!err.resp) {
                        return callback(err);
                    }
                    
                    return callback(err.body);
                }
                
                log("deployment started with id " + deplId);
                azureMgt.monitorStatus(deplId, callback);
            });
        }); 
    }
    
    /**
     * Upload a .cspkg file to Windows Azure Blob Storage
     */
    function uploadPackage(file, callback) {
        azureMgt.getStorageServices(function (err, svc) {
            if (err) return callback(err);
            
            var name = svc[0].ServiceName;
            log("using storage service", name);
            azureMgt.getStorageCredentials(name, function (err, primaryKey) {
                if (err) return callback(err);
                
                var blobService = azure.createBlobService(name, primaryKey);
                blobService.createContainerIfNotExists('c9deploys', { publicAccessLevel : 'blob' }, function (err) {
                    if (err) {
                        log("BlobService error", err);
                        return callback(err);
                    }
                                    
                    var blobname = uuid.v4() + ".cspkg";
                    log("preparing for upload '" + file + "' under blobname '" + blobname + "'");
                    
                    blobService.createBlockBlobFromFile("c9deploys", blobname, file, 11, function (err) {
                        if (err) {
                            log("BlobService error", err);
                            return callback(err);
                        }
                        
                        callback(null, "http://" + name + ".blob.core.windows.net/c9deploys/" + blobname);
                    });
                });
                
            });
        });
    }
    
    function waitForServiceToBeStarted(service, onStatusChange, callback) {
        var lastServiceStatus = "";
        function checkServiceRunning () {
            azureMgt.getHostedServiceDeploymentInfo(service, "production", function (err, depls) {
                if (err) return callback(err);
                
                var d = depls.deploys[depls.length - 1];
                
                var roles = azureMgt.$normalizeArray(d.RoleInstanceList.RoleInstance);
                var role = roles[roles.length - 1];
                
                if (role.instanceStatus === "StoppedVM") {
                    // @todo start the VM
                    return callback(null, d.Url);
                }
                else if (role.InstanceStatus === "ReadyRole") {
                    return callback(null, d.Url);
                }
                else {
                    if (lastServiceStatus !== role.InstanceStatus) {
                        onStatusChange(role.InstanceStatus);
                        lastServiceStatus = role.InstanceStatus;
                    }
                    setTimeout(checkServiceRunning, 5000);
                }
            });
        }
        checkServiceRunning();            
    }

    this.publishPackage = publishPackage;
    this.uploadPackage = uploadPackage;
    this.waitForServiceToBeStarted = waitForServiceToBeStarted;
}