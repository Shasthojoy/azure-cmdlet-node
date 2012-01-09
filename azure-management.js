/**
 * A node.js library for working with the Azure Management REST API.
 * 
 * Usage:
 *      var AzureMgt = require("azure-management");
 *      var azureMgt = new AzureMgt("publishsettings body", "certificate", "private key");
 * 
 * Authors:
 *      Jan Jongboom <jan@c9.io>
 * 
 * (c) Cloud9 IDE, Inc. 2011
 */
var request = require("request");
var xml2js = require('xml2js');

module.exports = function (publishSettings, certificate, privateKey, debug) {
    var exp = (function () {
       
        /**
         * Internal helper function
         */
        function doAzureRequest (url, version, body, callback) {
            var method = !body ? "GET" : "POST";
            
            url = url.indexOf("/") === 0 ? url.substring(1) : url;
            
            parsePublishSettings(publishSettings, function (sett) {
                request({
                    url: format(":0/:1/:2", sett.url, sett.id, url),
                    method: method,
                    headers: {
                        "x-ms-version": version,
                        "content-type": "application/xml"
                    },
                    body: body,
                    cert: certificate,
                    key: privateKey
                }, function (err, resp, body) {
                    if (resp.statusCode >= 300 && resp.statusCode < 600) {
                        if (debug) {
                            console.log("Response didn't have status in 200 range", url, resp.statusCode, body);
                        }

                        err = {
                            msg: "Expected resp.statusCode between 200 and 299",
                            resp: resp,
                            body: body
                        };
                    }

                    if (err) { 
                        callback(err);
                        return;
                    }
                    
                    if (body) {
                        parseXml(body, function(obj) {
                            obj.RequestId = resp.headers["x-ms-request-id"];
                            callback(err, obj);
                        });
                    }
                    else {
                        callback(err, { RequestId: resp.headers["x-ms-request-id"] });
                    }
                });
            });
        }

        /**
         * Retrieve a list of hosted services by name
         */
        function getHostedServices(callback) {
            doAzureRequest("/services/hostedservices", "2011-10-01", null, function(err, obj) {
                var services = normalizeArray(obj.HostedService);
                
                var resp = services.map(function(svc) {
                    return svc.ServiceName;
                });
        
                callback(resp);
            });
        }
        
        /**
         * Retrieve an detailled list of all the deployment properties for a given service.
         * The callback retrieves an array containing all the deployment objects matching the given slot, 
         * consisting of (a.o.):
         * - Status (Running, Starting, etc.)
         * - Url (public visible URL)
         * - Configuration (Base64 encoded config file)
         */
        function getHostedServiceDeploymentInfo(service, slot, callback) {
            doAzureRequest(format("/services/hostedservices/:0?embed-detail=true", service), "2011-10-01", null, function (err, obj) {
                if (err || !obj) {
                    callback([]);
                }
                
                var deploys = normalizeArray(obj.Deployments.Deployment);
                deploys = deploys.filter(function (d) { return d.DeploymentSlot.toLowerCase() === slot.toLowerCase(); });

                callback(deploys);
            });
        }
        
        /**
         * See whether there already is a deployment for a certain service & slot
         */
        function getDeployment(service, slot, callback) {
            var url = format("/services/hostedservices/:0/deploymentslots/:1", service, slot);
        
            doAzureRequest(url, "2011-10-01", null, function(err, resp) {
                if (!resp || resp.Code === "ResourceNotFound") {
                    callback(null);
                }
                else {
                    callback({
                        url: resp.Url
                    });
                }
            });
        }
        
        /**
         * Generate a config file
         */
        function generateConfigFile(service, config) {
            if (!config) {
                config = { };
            }

            config.operatingSystem = config.operatingSystem || constants.OS.WIN2008_SP2;
            config.instanceCount = config.instanceCount || 1;

            var configFile = format('<?xml version="1.0"?>\
<ServiceConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"\
    serviceName=":0" osFamily=":1" osVersion="*" xmlns="http://schemas.microsoft.com/ServiceHosting/2008/10/ServiceConfiguration">\
  <Role name="WebRole1">\
    <ConfigurationSettings />\
    <Instances count=":2" />\
    <Certificates />\
  </Role>\
</ServiceConfiguration>', service, config.operatingSystem, config.instanceCount);

            return configFile;
        }
        
        /**
         * Do a rolling upgrade of an already existing deployment
         */
        function updateDeployment(service, slot, packageUrl, callback) {
            getHostedServiceDeploymentInfo(service, slot, function (depls) {
                var deploy = depls[depls.length - 1];
                
                var data = format('<?xml version="1.0" encoding="utf-8"?>\
<UpgradeDeployment xmlns="http://schemas.microsoft.com/windowsazure">\
   <Mode>auto</Mode>\
   <PackageUrl>:0</PackageUrl>\
   <Configuration>:1</Configuration>\
   <Label>:2</Label>\
</UpgradeDeployment>', packageUrl, deploy.Configuration, new Buffer(uuid(), "utf8").toString("base64"));
                
                var url = format("/services/hostedservices/:0/deploymentslots/:1/?comp=upgrade", service, slot);
                
                doAzureRequest(url, "2009-10-01", data, function (err, depl) {
                    callback(err, depl ? depl.RequestId : 0);
                });                
            });
        }
        
        /**
         * Do a rolling upgrade of an already existing deployment
         */
        function createDeployment(service, slot, packageUrl, config, callback) {
            var configFile = generateConfigFile(service, config);
            
            var data = format('<?xml version="1.0" encoding="utf-8"?>\
<CreateDeployment xmlns="http://schemas.microsoft.com/windowsazure">\
  <Name>:3</Name>\
  <PackageUrl>:0</PackageUrl>\
  <Label>:1</Label>\
  <Configuration>:2</Configuration>\
  <StartDeployment>true</StartDeployment>\
  <TreatWarningsAsError>false</TreatWarningsAsError>\
</CreateDeployment>', packageUrl, new Buffer(uuid(), "utf8").toString("base64"), new Buffer(configFile, "utf8").toString("base64"), uuid());
            
            var url = format("/services/hostedservices/:0/deploymentslots/:1", service, slot);
            
            doAzureRequest(url, "2011-08-01", data, function (err, depl) {
                callback(err, depl ? depl.RequestId : 0);
            });
        }

        /**
         * Create a service if it doesn't exist yet
         */
        function createServiceIfNotExists(service, callback) {
            getHostedServices(function(services) {
                if (debug) {
                    console.log('existing services:', services);
                }
                
                if (services.indexOf(service) > -1) {
                    callback();
                    return;
                }
                var data = format('<?xml version="1.0" encoding="utf-8"?>\
<CreateHostedService xmlns="http://schemas.microsoft.com/windowsazure">\
  <ServiceName>:0</ServiceName>\
  <Label>:1</Label>\
  <Location>North Central US</Location>\
</CreateHostedService>', service, new Buffer(service, "utf8").toString("base64"));

                var url = "/services/hostedservices";

                doAzureRequest(url, "2010-10-28", data, function (err, depl) {
                    if (depl.RequestId) {
                        monitorStatus(depl.RequestId, callback);
                    }
                    else {
                        callback(err);
                    }
                });
            });
        }
        
        /**
         * Create or upgrade a deployment
         */
        function createUpdateDeployment(service, slot, packageUrl, config, callback) {
            getDeployment(service, slot, function (depl) {
                if (depl) {
                    updateDeployment(service, slot, packageUrl, callback);
                }
                else {
                    createDeployment(service, slot, packageUrl, config, callback);
                }
            });
        }
        
        /**
         * All Azure async requests have a request id. Use this one to query for completion.
         * If the callback contains 'true', the command succeeded, on 'false' it's still busy.
         * Check the err parameter for any errors.
         */
        function getStatus(requestId, callback) {
            var url = format("/operations/:0", requestId);
            
            doAzureRequest(url, "2011-10-01", null, function (err, operation) {
                if (err) {
                    callback(err, true);
                    return;
                }
                
                switch (operation.Status) {
                    case "Succeeded":
                        callback(null, true);
                        break;
                    case "InProgress":
                        callback(null, false);
                        break;
                    default:
                        callback(operation, true);
                        break;
                }
            });
        }
        
        /**
         * Wrapper around 'getStatus', monitors a requestId until it has been completed.
         * The callback contains one parameter 'err' that is filled with the error message
         * if the task failed.
         */
        function monitorStatus(requestId, onComplete) {
            getStatus(requestId, function (err, finished) {
                if (!err && finished) {
                    onComplete(null);
                }
                else if (err) {
                    onComplete(err);
                    return;
                }
                else {
                    setTimeout(monitorStatus(requestId, onComplete), 2000);
                }                
            });
        }
        
        /**
         * Retrieve a list of all storage services
         * Returns an error containing ServiceName and Url of the accounts
         */
        function getStorageServices(callback) {
            doAzureRequest("/services/storageservices", "2011-10-01", null, function (err, data) {
                var services = normalizeArray(data.StorageService);
                
                callback(services);
            });
        }
        
        /**
         * Retrieve a storage key for an account
         */
        function getStorageCredentials(account, callback) {
            var url = format("/services/storageservices/:0/keys", account);
            
            doAzureRequest(url, "2011-10-01", null, function (err, data) {
                callback(data.StorageServiceKeys.Primary, data.StorageServiceKeys.Secondary);
            });            
        }
        
        /**
         * Update the configuration of a running deploy
         */
        function upgradeConfiguration(service, slot, config, callback) {
            var conf = generateConfigFile(service, config);
            
            var post = format('<?xml version="1.0" encoding="utf-8"?>\
<ChangeConfiguration xmlns="http://schemas.microsoft.com/windowsazure">\
   <Configuration>:0</Configuration>\
   <TreatWarningsAsError>false</TreatWarningsAsError>\
   <Mode>Auto</Mode>\
</ChangeConfiguration>', new Buffer(conf, "utf8").toString("base64"));

            var url = format("/services/hostedservices/:0/deploymentslots/:1/?comp=config", service, slot);
            doAzureRequest(url, "2011-08-01", post, function (err, data) {
                if (err) {
                    callback(err);
                }
                
                callback(data.RequestId);
            });
        }
        
        /**
         * xml2js doesn't do xsd's, so the format may vary depending on the number of
         * items in the xml message. This one normalizes arrays.
         */
        function normalizeArray(field) {
            if (!field) {
                return [];
            }
            else if (!(field instanceof Array)) {
                return [ field ];
            }
            else {
                return field;
            }
        }
        
        var constants = {
            OS: {
                WIN2008_SP2: 1,
                WIN2008_R2: 2
            }
        }
        
        return {
            getHostedServices: getHostedServices,
            createUpdateDeployment: createUpdateDeployment,
            createServiceIfNotExists: createServiceIfNotExists,
            getStatus: getStatus,
            getStorageServices: getStorageServices,
            getStorageCredentials: getStorageCredentials,
            monitorStatus: monitorStatus,
            getHostedServiceDeploymentInfo: getHostedServiceDeploymentInfo,
            upgradeConfiguration: upgradeConfiguration,
            $normalizeArray: normalizeArray,
            constants: constants
        };
       
    }());
    
    
    var _self = this;
    Object.keys(exp).forEach(function (k) {
        _self[k] = exp[k];
    });
};

/**
 * Quickly format a string. Usage:
 * format("I am :0 and I work at :1", "Jan", "Cloud9")
 */
function format () {
    var base = arguments[0];
    
    for (var ix = 1; ix < arguments.length; ix++) {
        base = base.replace(new RegExp(":" + (ix-1), "g"), arguments[ix]);
    }
    
    return base;
}

/**
 * Parse the publish settings XML and retrieve it back as a nice object
 */
function parsePublishSettings (data, callback) {
    parseXml(data, function (obj) {
        var opts = {
            url: obj.PublishProfile["@"].Url,
            certificate: obj.PublishProfile["@"].ManagementCertificate,
            id: obj.PublishProfile.Subscription["@"].Id
        };
        
        callback(opts);
    });
}

/**
 * Simple wrapper around xml2js
 */
function parseXml(data, callback) {
    var parser = new xml2js.Parser();
    
    parser.on('end', function(result) {
        callback(result);
    });
    
    parser.parseString(data);
}

function uuid() {
    var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

/*
<?xml version="1.0" encoding="utf-8"?>
<PublishData>
  <PublishProfile
    PublishMethod="AzureServiceManagementAPI"
    Url="https://management.core.windows.net/"
    ManagementCertificate="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">
    <Subscription
      Id="9345d853-bcb4-49cb-980c-48aaca5cdc19"
      Name="3-Month Free Trial" />
  </PublishProfile>
</PublishData>
*/