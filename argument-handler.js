var exec = require('child_process').exec;

module.exports = {
    createCert: createCert,
    openPortal: openPortal,
    downloadPublishSettings: downloadPublishSettings
};

/**
 * Create a X509 certificate to be used by Azure
 */
function createCert(callback) {
    var cmds='openssl genrsa -out ./certificates/ca.key 2048 &&\
openssl req -new -x509 -days 1001 -key ./certificates/ca.key -out ./certificates/master.cer -batch &&\
openssl x509 -in ./certificates/master.cer -outform DER -out ./certificates/master-der.cer';
    exec(cmds, function (err) {
        if (err) {
            callback(err);
            return;
        }
        console.log("X509 Certificate created in ./certificates, upload ./certificates/master-der.cer to Azure Management Portal.");
        callback();
    }); 
}

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