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
var xml2js = require("xml2js");

module.exports = function (publishSettings, certificate, privateKey) {
    var exp = (function () {
               
        /**
         * Internal helper function to simplify requests to Windows Azure
         */
        function doAzureRequest (url, version, body, callback) {
            var method = !body ? "GET" : "POST";
            
            url = url.indexOf("/") === 0 ? url.substring(1) : url;
            
            parsePublishSettings(publishSettings, function (err, sett) {
                if (err) return callback(err);
                
                request({
                    url: format(":0/:1/:2", sett.url, sett.id, url),
                    method: method,
                    headers: {
                        "x-ms-version": version,
                        "content-type": "application/xml"
                    },
                    body: body,
                    cert: certificate,
                    key: privateKey,
                    agent: false // prevent keep alive. it fucks you up
                }, function (err, resp, body) {                    
                    var onBodyParsed = function (bodyAsXml) {
                        if (resp.statusCode >= 300 && resp.statusCode < 600) {
                            // console.log("Response didn't have status in 200 range", url, resp.statusCode, body);
                                                        
                            err = {
                                msg: "Expected resp.statusCode between 200 and 299",
                                body: bodyAsXml
                            };
                        }
                        
                        if (err) { 
                            return callback(err);
                        }
                        
                        bodyAsXml = bodyAsXml || {};
                        bodyAsXml.RequestId = resp.headers["x-ms-request-id"];
                        
                        callback(err, bodyAsXml);
                    };
                    
                    if (body) {
                        parseXml(body, function(err, obj) {
                            if (err) return callback(err);
                            
                            onBodyParsed(obj);
                        });     
                    }
                    else {
                        onBodyParsed();
                    }
                });
            });
        }

        /**
         * Retrieve a list of hosted services by name
         */
        function getHostedServices(slot, callback) {
            doAzureRequest("/services/hostedservices", "2011-10-01", null, function(err, obj) {
                if (err) return callback(err);
                
                if (!obj.HostedService) {
                    return callback(null, []);
                }
                
                var services = normalizeArray(obj.HostedService);
                
                var counter = 0, data = [];
                
                var pushAndCheck = function (obj) {
                    data.push(obj);
                    if (++counter === services.length) {
                        callback(err, data);
                    }
                };
                
                var handleDetailedInfo = function (svc, err, info) {                    
                    if (err) return callback(err);
                    
                    var obj = {
                        name: svc.ServiceName,
                        datacenter: info.service.HostedServiceProperties.Location
                    };
                    
                    if (!info.deploys.length || !info.deploys[0].Configuration) {
                        obj.instanceCount = 1;
                        obj.operatingSystem = 1;
                        return pushAndCheck(obj);
                    }
                    
                    parseXml(new Buffer(info.deploys[0].Configuration, 'base64').toString('ascii'), function (err, cfg) {
                        if (err) return callback(err);
                        
                        obj.operatingSystem = cfg["@"].osFamily;
                        
                        var role = normalizeArray(cfg.Role)[0];
                        var instance = normalizeArray(role.Instances)[0];
                        obj.instanceCount = instance["@"].count;
                        
                        pushAndCheck(obj);
                    });
                };
                
                services.forEach(function (svc) {
                    getHostedServiceDeploymentInfo(svc.ServiceName, slot, function (err, depl) {
                        handleDetailedInfo(svc, err, depl);
                    });
                });
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
                    callback(null, []);
                }
                
                var deploys = normalizeArray(obj.Deployments.Deployment);
                deploys = deploys.filter(function (d) { return d.DeploymentSlot.toLowerCase() === slot.toLowerCase(); });

                callback(null, { deploys: deploys, service: obj });
            });
        }
        
        /**
         * See whether there already is a deployment for a certain service & slot
         */
        function getDeployment(service, slot, callback) {
            var url = format("/services/hostedservices/:0/deploymentslots/:1", service, slot);
        
            doAzureRequest(url, "2011-10-01", null, function(err, resp) {
                if (!resp || resp.Code === "ResourceNotFound") {
                    callback(null, null);
                }
                else {
                    callback(err, {
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
            getHostedServiceDeploymentInfo(service, slot, function (err, depls) {
                if (err) return callback(err);
                
                var deploy = depls.deploys[depls.deploys.length - 1];
                
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
        function createServiceIfNotExists(service, slot, config, callback) {
            getHostedServices(slot, function(err, services) {
                if (err) return callback(err);
                
                services = services.map(function (s) { return s.name; });
                
                if (services.indexOf(service) > -1) {
                    callback();
                    return;
                }
                var data = format('<?xml version="1.0" encoding="utf-8"?>\
<CreateHostedService xmlns="http://schemas.microsoft.com/windowsazure">\
  <ServiceName>:0</ServiceName>\
  <Label>:1</Label>\
  <Location>:2</Location>\
</CreateHostedService>', service, new Buffer(service, "utf8").toString("base64"), (config && config.datacenter) || "North Central US");

                var url = "/services/hostedservices";

                doAzureRequest(url, "2010-10-28", data, function (err, depl) {
                    if (!depl || !depl.RequestId) {
                        callback(err);
                    }
                    else {
                        monitorStatus(depl.RequestId, callback);
                    }
                    
                });
            });
        }
        
        /**
         * Create or upgrade a deployment
         */
        function createUpdateDeployment(service, slot, packageUrl, config, callback) {
            getDeployment(service, slot, function (err, depl) {
                if (err) return callback(err);
                
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
                    return callback(err, true);
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
            if (typeof onComplete !== "function") {
                console.log("monitorStatus callback isnt a function");
                console.trace();
            }
            
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
         * Returns an callback containing ServiceName and Url of the accounts
         */
        function getStorageServices(callback) {
            doAzureRequest("/services/storageservices", "2011-10-01", null, function (err, data) {
                if (err) return callback(err);
                
                var services = normalizeArray(data.StorageService);
                
                callback(null, services);
            });
        }
        
        /**
         * Create a storage service
         */
        function createStorageService(name, callback) {
            name = name.replace(/[^\w]+/g, "");
            
            var url = "/services/storageservices";
            var data = format('<?xml version="1.0" encoding="utf-8"?>\
<CreateStorageServiceInput xmlns="http://schemas.microsoft.com/windowsazure">\
   <ServiceName>:0</ServiceName>\
   <Description>:1</Description>\
   <Label>:2</Label>\
   <Location>North Central US</Location>\
</CreateStorageServiceInput>', name, "Storage account created by Cloud9", new Buffer(name, "utf8").toString("base64"));

            doAzureRequest(url, "2011-10-01", data, function (err, data) {
                if (err) return callback(err);
                
                monitorStatus(data.RequestId, function (err) {
                    if (err) return callback(err);
                    
                    callback(null, name);;
                });
            });
        }
        
        /**
         * Retrieve a storage key for an account
         */
        function getStorageCredentials(account, callback) {
            var url = format("/services/storageservices/:0/keys", account);
            
            doAzureRequest(url, "2011-10-01", null, function (err, data) {
                if (err) return callback(err);
                
                callback(null, data.StorageServiceKeys.Primary, data.StorageServiceKeys.Secondary);
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
                    return callback(err);
                }
                
                callback(null, data.RequestId);
            });
        }
        
        /**
         * List all available datacenters, use to pass in the 'config.datacenter' argument.
         * 
         * An array of strings will be passed into the callback function
         */
        function getDatacenterLocations(callback) {
            var url = "/locations";
            doAzureRequest(url, "2010-10-28", null, function (err, data) {
                if (err) return callback(err);
                
                var res = normalizeArray(data.Location).map(function (loc) {
                    return loc.Name;
                });
                
                callback(null, res);
            });
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
            constants: constants,
            getDatacenterLocations: getDatacenterLocations,
            parsePublishSettings: parsePublishSettings,
            createStorageService: createStorageService
        };
       
    }());
    
    
    var _self = this;
    Object.keys(exp).forEach(function (k) {
        _self[k] = exp[k];
    });
};

module.exports.normalizeArray = normalizeArray;
module.exports.parsePublishSettings = parsePublishSettings;
module.exports.getSubscriptionIds = getSubscriptionIds;
module.exports.normalizePublishSettings = normalizePublishSettings;

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
 * Retrieve all subscription ids found in a publishSettings file
 */
function getSubscriptionIds (publishSettings, callback) {
    parseXml(publishSettings, function (err, obj) {
        if (err) return callback(err);
        
        if (!obj.PublishProfile || !obj.PublishProfile["@"]) {
            return callback("This file doesn't seem to be a publish settings file");
        }        
        
        callback(null, normalizeArray(obj.PublishProfile.Subscription).map(function (s) { return { id: s["@"].Id, name: s["@"].Name }; }));
    });
}

/**
 * So given a publishsettings file you can select one subscriptionId (if more are present)
 */
function normalizePublishSettings (publishSettings, subscriptionId, callback) {
    parseXml(publishSettings, function (err, obj) {
        if (err) return callback(err, null);
        
        if (!obj.PublishProfile || !obj.PublishProfile["@"]) {
            return callback("This file doesn't seem to be a publish settings file");
        }
        
        // remove all other subscriptions
        obj.PublishProfile.Subscription = normalizeArray(obj.PublishProfile.Subscription);
        obj.PublishProfile.Subscription.forEach(function (s, ix) {
            if (s["@"].Id !== subscriptionId) {
                obj.PublishProfile.Subscription.splice(ix, 1);
            }
        });
        
        js2xml(obj, null, function (xml) {
            if (!xml) return callback("js2xml failed");
            
            callback(null, xml);
        });
    });
}

/**
 * Parse the publish settings XML and retrieve it back as a nice object
 */
function parsePublishSettings (data, callback) {
    parseXml(data, function (err, obj) {
        if (err) return callback(err, null);
        
        if (!obj.PublishProfile || !obj.PublishProfile["@"]) {
            return callback("This file doesn't seem to be a publish settings file");
        }
        
        // its possible to have multiple subscriptions... we'll choose the first one
        // you should use 'getSubscriptionIds' and 'normalizePublishSettings' beforehand
        var subscription = normalizeArray(obj.PublishProfile.Subscription)[0];
        
        var opts = {
            url: obj.PublishProfile["@"].Url,
            certificate: obj.PublishProfile["@"].ManagementCertificate,
            id: subscription["@"].Id
        };
        
        callback(null, opts);
    });
}

/**
 * Simple wrapper around xml2js
 */
function parseXml(data, callback) {
    var parser = new xml2js.Parser();
    
    data = data || "";
    
    parser.on('end', function(result) {
        if (!result) {
            return callback("xml2js was feeded with an empty string");
        }
        callback(null, result);
    });
    
    parser.on('error', function (err) {
        callback(err, null);
    });
    
    parser.parseString(data);
}

/**
 * Generate a simple UUID formatted number
 */
function uuid() {
    var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

/**
 * js2xml (xml2js but the other way around)
 * from https://gist.github.com/1495793
 */
var js2xml = function(json, root, cb) {
    var recursion = 0;
    var xml = '<?xml version="1.0" ?>';
	var isArray = function(obj) {
		return obj && obj.constructor == Array;
	};

	var parseAttributes = function(node) {
		for (var key in node) {
			var value = node[key];
			xml += ' ' + key + '="' + value + '"';
		};
		xml += '>';
	};

	var parseNode = function(node, parentNode) {
		recursion++;
		// Handle Object structures in the JSON properly
		if (!isArray(node)) {
			xml += '<' + parentNode;
			if (typeof node == 'object' && node['@']) {
				parseAttributes(node['@']);
			}
			else {
				xml += '>';
			}
			for (var key in node) {
				var value = node[key];
				// text values
				if (typeof value == 'string') {
					if (key === '#') {
						xml += value;
					}
					else {
						xml += '<' + key + '>' + value + '</' + key + '>';
					}
				}
				// is an object
				if (typeof value == 'object' && key != '@') {
					parseNode(node[key], key);
				}
			}
			recursion--;
			xml += '</' + parentNode + '>';
		}

		// Handle array structures in the JSON properly
		if (isArray(node)) {
			for (var i = 0; i < node.length; i++) {
				parseNode(node[i], parentNode);
			}
			recursion--;
		}

		if (recursion === 0) {
			cb(xml);
		}
	};
	parseNode(json, root); // fire up the parser!
};