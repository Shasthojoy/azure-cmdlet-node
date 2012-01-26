var exec = require('child_process').exec;

module.exports = {
    openPortal: openPortal,
    downloadPublishSettings: downloadPublishSettings
};

/**
 * Open the Azure Management portal
 */
function openPortal(callback) {
    var cmd='open http://windows.azure.com';
    exec(cmd, function (err) {
        if (err) {
            callback(err);
            return;
        }
        callback();
    }); 
}

/**
 * Download the publish settings
*/
function downloadPublishSettings(callback) {
    var cmd='open https://windows.azure.com/download/publishprofile.aspx?client=nodejs&amp;lang=en'
    exec(cmd, function(err) {
        if (err) {
            callback(err);
            return;
        }
        callback();
    });
}