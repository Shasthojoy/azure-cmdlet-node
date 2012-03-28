/**
 * Get all data center locations
 */
var program = require("commander");
var argumentHandler = require("./argument-handler");

program
    .option("-c, --certificate [certificateFile]", "Location of the subscription file")
    .option("-s, --subscription [subscriptionId]", "Subscription ID (required if multiple are defined in the file")
    .parse(process.argv);

argumentHandler.getAzureMgt(program.certificate, program.subscription, function (err, azureMgt) {
    if (err) return console.log(err);
    
    azureMgt.getDatacenterLocations(function (err, locs) {
        if (err) return console.log(err);
        
        var data = locs.join("\n");
        
        console.log(data);
    });
});