var uuid = require("node-uuid");
var azure = require("azure-sdk-for-node");

module.exports = PublishHelper;

function PublishHelper(azureMgt) {
    
    function log () {
        console.log.apply(this, arguments);
    }
    
    /**
     * Publish a .cspkg
     */
    function publishPackage(pkg, service, config, rdpCert, callback) {
        log("creating service " + service);
    
        azureMgt.createServiceIfNotExists(service, "production", config, function(err) {
            if (err) {
                return callback(err);
            }
            
            if (rdpCert) {
                log("adding certificate");
                
                azureMgt.addCertificate(service, rdpCert, function (err, requestId) {
                    if (err) return callback(err);
                         
                    azureMgt.monitorStatus(requestId, function (err) {
                        if (err) return callback(err);
                        
                        _();
                    });
                });
            }
            else {
                _();
            }
            
            var _ = function () {
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
            };
        }); 
    }
    
    /**
     * Upload a .cspkg file to Windows Azure Blob Storage
     */
    function uploadPackage(file, callback) {
        azureMgt.getStorageServices(function (err, svc) {
            if (err) return callback(err);
            
            var andNowToWork = function (name) {
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
            };            
            
            if (!svc || !svc.length) {
                azureMgt.createStorageService(uuid.v4().toString().substring(0, 20), function (err, name) {
                    if (err) return callback(err);
                    
                    andNowToWork(name);
                });
            }
            else {
                andNowToWork(svc[0].ServiceName);
            }
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
    
    function getRdpSettings (username, password, prvKey, callback) {
        var fs = require("fs");
        var exec = require("child_process").exec;
        
        var root = "./certificates/" + uuid.v4();
        
        // write prvkey and password to disk so we can reference em via openssl
        fs.writeFile(root + ".key", prvKey, "ascii", function (err1) {
            fs.writeFile(root + ".pwd", password, "ascii", function (err2) {
                if (err1 || err2) return callback(err1 || err2);
                
                executeOpenSsl();
            });
        });
        
        var executeOpenSsl = function () {
            // encrypt password with private key into .enc
            // create pkcs12 file from private key into .p12
            // get fingerprint from private key into .fp
            var openssl = 
                [ "openssl cms -encrypt -in :0.pwd -outform der :0.key > :0.enc",
                  "openssl pkcs12 -export -in :0.key -passout pass: -out :0.p12",
                  "openssl x509 -in :0.key -noout -fingerprint > :0.fp" ];
            
            var cmd = openssl.map(function (c) { return c.replace(/:0/g, root); }).join("\n");
            
            exec(cmd, function (err, stdout, stderr) {
                if (err || stderr) return callback(err || stderr);
                
                fs.readFile(root + ".enc", function (err, encryptedBuffer) {
                    if (err) return callback(err);
                    fs.readFile(root + ".p12", function (err, certificateBuffer) {
                        if (err) return callback(err);
                        fs.readFile(root + ".fp", "ascii", function (err, fingerprint) {
                            if (err) return callback(err);
                            
                            var encrypted = encryptedBuffer.toString("base64");
                            var cert = certificateBuffer.toString("base64");
                            var thumbprint = fingerprint.replace(/SHA1 Fingerprint=/, "").replace(/\:/g, "").split('\n')[0].trim();
                            
                            // remove files
                            var ext = [ "key", "pwd", "enc", "p12", "fp" ];
                            ext.forEach(function (x) {
                                fs.unlink(root + "." + x);
                            });
                            
                            var rdp = {
                                username: username,
                                encryptedPassword: encrypted,
                                thumbprint: thumbprint,
                                enabled: true
                            };
                            
                            callback(null, rdp, cert);
                        });
                    });
                });
            });
        };     
    }

    this.publishPackage = publishPackage;
    this.uploadPackage = uploadPackage;
    this.waitForServiceToBeStarted = waitForServiceToBeStarted;
    this.getRdpSettings = getRdpSettings;
}