var uuid = require("node-uuid");
var azure = require("azure-sdk-for-node");

module.exports = PublishHelper;

function PublishHelper(azureMgt) {
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
            
            createUpdateDeployment();
        });

        function createUpdateDeployment() {
            console.log("starting deployment for " + service);

            azureMgt.createUpdateDeployment(service, "production", pkg, function (err, deplId) {
                console.log("deployment started with id " + deplId);
                azureMgt.monitorStatus(deplId, callback);
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


    this.publishPackage = publishPackage;
    this.uploadPackage = uploadPackage;
}