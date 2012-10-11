#!/usr/bin/env node
/**
 * Get all data center locations
 */
var program = require("commander");
var argumentHandler = require("./argument-handler");
var makeTable = require("./make-table");

program
    .option("-c, --certificate [certificateFile]", "Location of the subscription file")
    .option("-s, --subscription [subscriptionId]", "Subscription ID (required if multiple are defined in the file")
    .option('--json', "Get the response in json")
    .parse(process.argv);

argumentHandler.getAzureMgt(program.certificate, program.subscription, function (err, azureMgt) {
    if (err) return console.error(err);
    
    azureMgt.getDatacenterLocations(function (err, locs) {
        if (err) return console.error(err);
        
        if (program.json) {
            console.log(JSON.stringify(locs)); 
        }
        else {
            var data = locs.map(function (l) {
                return { location: l };
            });
            console.log(makeTable(data));
        }
    });
});