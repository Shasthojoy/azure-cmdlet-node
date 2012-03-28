/**
 * Download Azure subscription details
 */
var argumentHandler = require("./argument-handler");

argumentHandler.downloadPublishSettings(function(err) {
    if (err) {
        return console.log(err);
    }
});