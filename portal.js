/**
 * Open the Azure management portal
 */
var argumentHandler = require("./argument-handler");

argumentHandler.openPortal(function(err) {
    if (err) {
        console.log(err);
    }
});