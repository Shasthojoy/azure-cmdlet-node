#!node

var fs = require("fs");
var uuid = require("node-uuid");

var PublishHelper = require("./publish-helper");
var packager = require("azure-packager-node");
var argumentHandler = require("./argument-handler");

var program = require('commander');

program
    .option('-p, --publish [serviceName]', 'publish the service')
    .option("-l, --location [appFolder]", "Folder where the app is located")
    .option("-c, --certificate [certificateFile]", "Location of the subscription file")
    .option("-s, --subscription [subscriptionId]", "Subscription ID (required if multiple are defined in the file")
    .option('-r, --enablerdp', 'enable rdp for the given service with -p')
    .option('--rdpuser [user]', 'rdp username (only valid with -r)')
    .option('--rdppassword [password]', 'rdp password (only valid with -r)')
    .option('--os [operatingSystemId]', "Operating system, 1=Win2008SP2, 2=Win2008R2")
    .option('--numberofinstances [numberOfInstances]', "Number of instances, defaults to 1")
    .option('--slot [slot]', "Deployment slot (stage or production)")
    .option('--datacenter [location]', "Obtain via location.js, defaults to North America")
    .parse(process.argv);
    
if (program.publish) { 
    if (program.publish === true) {
        return console.error("error: service name is required, specify '-p servicename'");
    }
    
    if (!program.location) {
        return console.error("error: No application specified. Specify '-l folder'");
    }
    
    /* // you can update the config of a deployment like this:
    azureMgt.upgradeConfiguration(program.publish, "production", { instanceCount: 2 }, function (reqId) {
        azureMgt.monitorStatus(reqId, function (err) {
            console.log("config update", err);
        });
    });
    */
                    
    argumentHandler.getAzureMgt(program.certificate, program.subscription, function (err, azureMgt, cert, key) {
        if (err) return console.error("getAzureMgt failed", err);
        
        var publish = new PublishHelper(azureMgt, program.slot || "production");
        
        console.log("[1/6] Start packaging of '" + program.location + "'");
        
        packager(program.location, "./build_temp/" + uuid.v4(), function (err, file) {
            if (err) return console.error("Packaging failed", err);
            
            console.log("[2/6] Packaging succeeded, uploading to Blob Storage");
            
            publish.uploadPackage(file, function (err, pkg) {
                if (err) { 
                    return console.error("uploadPackage failed", err);
                }
                
                console.log("[3/6] Package uploaded to", pkg, "Start publishing");
                
                fs.unlink(file, function (err) {
                    //
                });
                
                var rdpuser, rdppassword;
                if (!program.enablerdp) { // use some random stuff cause azure needs this, cant leave it empty
                    rdpuser = "cloud9";
                    rdppassword = uuid.v4().substring(10);
                }
                else {
                    if (!program.rdpuser || !program.rdppassword) {
                        return console.error("No rdp user or password specified. Add --rdpuser [user] --rdppassword [password]");
                    }
                    rdpuser = program.rdpuser;
                    rdppassword = program.rdppassword;
                }
                
                publish.getRdpSettings("./certificates/" + uuid.v4(), rdpuser, rdppassword, key, function (err, rdp, rdpCert) {
                    if (err) return console.error("getRdpSettings failed", err);
                    
                    rdp.enabled = !!program.rdpuser;
                    
                    // specify the (default) config settings, they will be set if a new deployment is created
                    // otherwise use 'upgradeConfiguration([service], [slot], [config], [callback])'
                    var defaultConfig = {
                        operatingSystem: program.os || azureMgt.constants.OS.WIN2008_SP2,
                        instanceCount: program.numberofinstances || 1,
                        rdp: rdp,
                        datacenter: program.datacenter
                    };
                    
                    publish.publishPackage(pkg, program.publish, defaultConfig, rdpCert, function (err) {
                        if (err) {
                            console.error("publish error", err);
                        }
                        else {
                            console.log("[4/6] Publish succeeded. Waiting for VM.");
                        }
                        
                        publish.waitForServiceToBeStarted(program.publish, function (status) {
                            console.log("[5/6] Service status is now", status);
                        }, function (err, url) {
                            if (err) return console.error("waitForServiceToBeStarted failed");
                            
                            console.log("[6/6] Service running and available on " + url);
                        });
                    });
                });
            });
        });    
    });
}
else {
    console.log(program.helpInformation());
}