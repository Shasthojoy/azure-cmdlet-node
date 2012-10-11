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
    .option('--slot [slot]', "Deployment slot (stage or production), defaults to production")
    .option('--json', "Get the response in json")
    .parse(process.argv);
    
argumentHandler.getAzureMgt(program.certificate, program.subscription, function (err, azureMgt) {
    if (err) return console.error(err);
    
    azureMgt.getHostedServices(program.slot || "production", function (err, services) {
        if (err) return console.error(err);
        
        if (program.json) {
            console.log(JSON.stringify(services)); 
        }
        else {
            console.log(makeTable(services));
        }
    });
});