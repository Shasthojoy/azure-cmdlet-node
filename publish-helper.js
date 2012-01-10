var uuid = require("node-uuid");
var azure = require("azure-sdk-for-node");

module.exports = PublishHelper;

function PublishHelper(azureMgt) {
    /**
     * Publish a .cspkg
     */
    function publishPackage(pkg, service, config, callback) {
        console.log("creating service " + service);
    
        azureMgt.createServiceIfNotExists(service, config, function(err, deplId) {
            if (err) {
                callback(err);
                return;
            }
            
            console.log("starting deployment for " + service);

            azureMgt.createUpdateDeployment(service, "production", pkg, config, function (err, deplId) {
                console.log("deployment started with id " + deplId);
                azureMgt.monitorStatus(deplId, callback);
            });
        }); 
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
    
    function waitForServiceToBeStarted(service, callback) {
        var lastServiceStatus = "";
        function checkServiceRunning () {
            azureMgt.getHostedServiceDeploymentInfo(service, "production", function (depls) {
                var d = depls[depls.length - 1];
                
                var roles = azureMgt.$normalizeArray(d.RoleInstanceList.RoleInstance);
                var role = roles[roles.length - 1];
                
                if (role.instanceStatus === "StoppedVM") {
                    // @todo start the VM
                    callback(d.Url);
                }
                else if (role.InstanceStatus === "ReadyRole") {
                    callback(d.Url);
                }
                else {
                    if (lastServiceStatus !== role.InstanceStatus) {
                        console.log("Service status is now '" + role.InstanceStatus + "'");
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