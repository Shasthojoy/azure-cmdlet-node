/**
 * Open the Azure management portal
 */
var argumentHandler = require("./argument-handler");

argumentHandler.openPortal(function(err) {
    if (err) {
        console.error(err);
    }
});