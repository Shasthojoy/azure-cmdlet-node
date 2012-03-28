# Cross platform Azure deployment tools for node.js

With the tools provided in this package it is possible to publish node.js
applications to Windows Azure.
Contrary to the Microsoft PowerShell commands that only run on Windows,
these tools will run on any platform that supports node.js (OS/X, Linux, Solaris, etc.).

These tools have been developed by [Cloud9 IDE](http://c9.io) 
in conjunction with Microsoft.

## Deploy a hello world app

### Getting started

Install [node.js](http://nodejs.org), either 0.4.12 or 0.6.x.
Now run:

```
git clone git@github.com:c9/azure-cmdlet-node.git 
cd azure-cmdlet-node
git submodule update --init --recursive
npm install
cd node_modules/azure/
npm install
cd ../..
```

### Create an application

First create a folder with 'server.js' in there with the following content:

```javascript
var http = require('http');

http.createServer(function (req, res) {
  console.log("req");
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World from Azure\n');
}).listen(process.env.PORT);
```

### Authenticate

Because we need to authenticate you with Windows Azure, we'll need subscription
information. 
Download a file containing the relevant certificate via:

```bash
node download-subscription.js
```

You can test whether this certificate is valid by typing 
(replace `~/Downloads/...` by your own location):

```bash
node locations.js -c ~/Downloads/personal.publishsettings
```

### Publish the application

Now type the following command, where:

* `-p` is the name of your app on Azure (has to be unique)
* `-l` is the folder on your hard drive where you node project is
* `-c` the certificate file

```bash
node publish.js -p your_app_name -l ~/Projects/app_folder/ -c ~/Downloads/personal.publishsettings
```

Now make some coffee because this will take a while.
Useful progress information will be emitted to the stdout.

### Monitoring the app in the Windows Azure portal

To find some more info and additional tweakable settings, visit the Windows
Azure portal via:

```bash
node portal.js
```

## Publish options

When publishing an application, we offer the following useful options.

* `-p [serviceName]` The name of the service on Windows Azure
* `-l [folder]` Folder where your app is located
* `-c [certificate]` Certificate location
* `-s [subscriptionId` It's possible to have multiple subscriptions associated to your account. When you receive a message about this, specify the ID via this parameter.
* `--enablerdp` Enable RDP for the server
* `--rdpuser [user]` Username to log in to RDP
* `--rdppassword [password]` Password to log in to RDP
* `--os [osId]` Operating system to run on the server. Use 1 for Windows 2008 SP2, or 2 for Windows 2008 R2
* `--numberofinstances [noi]` How many instances we'll create for you
* `--slot [slot]` Azure offers two deployment slots, 'production' and 'stage'. Can be used for hot swapping and testing.
* `--datacenter [location]` Which data center? A list can be obtained from `location.js` 

## List of commands included

Type `node [cmd]` to start, or `node [cmd] --help` for options.

* `download-subscriptions.js` Download Azure subscription certificate
* `locations.js` List all data center locations that you can deploy to
* `portal.js` Open the Azure Management Portal
* `publish.js` Publish an application to Windows Azure

## More control!

You can override the `web.config` file by putting a file called `Web.cloud.config` in the
root of your app folder that follows the following structure:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
  For more information on how to configure your ASP.NET application, please visit
  http://go.microsoft.com/fwlink/?LinkId=169433
  -->
<configuration>
  <system.webServer>
    <modules runAllManagedModulesForAllRequests="false" />
    
    <!-- NOTE: You probably want to set these to false when deploying to production -->
    <iisnode 
      debuggingEnabled="false"
      loggingEnabled="true"
      devErrorsEnabled="true"
    />

    <!-- indicates that the server.js file is a node.js application 
    to be handled by the iisnode module -->
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <clear />
        <rule name="app" enabled="true" patternSyntax="ECMAScript" stopProcessing="true">
            <match url="server\.js.+" negate="true" />
            <conditions logicalGrouping="MatchAll" trackAllCaptures="false" />
            <action type="Rewrite" url="server.js" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

### Specifying instance size

You can specify the server instance size and more by adding a `ServiceDefinition.csdef`
file in your app folder. Example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ServiceDefinition xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" name="TaskListContoso12345" xmlns="http://schemas.microsoft.com/ServiceHosting/2008/10/ServiceDefinition">
  <WebRole name="WebRole1" vmsize="ExtraSmall">
    <LocalResources>
      <LocalStorage name="DiagnosticStore" sizeInMB="4096" cleanOnRoleRecycle="false" />
    </LocalResources>
    <ConfigurationSettings>
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.AccountEncryptedPassword" />
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.AccountExpiration" />
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.AccountUsername" />
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.Enabled" />
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteForwarder.Enabled" />
    </ConfigurationSettings>
    <Endpoints>
      <InputEndpoint name="Endpoint1" protocol="http" port="80" localPort="80" />
      <InputEndpoint name="Microsoft.WindowsAzure.Plugins.RemoteForwarder.RdpInput" protocol="tcp" port="3389" localPort="*" ignoreRoleInstanceStatus="true" />
      <InternalEndpoint name="Microsoft.WindowsAzure.Plugins.RemoteAccess.Rdp" protocol="tcp">
        <FixedPortRange min="3389" max="3389" />
      </InternalEndpoint>
    </Endpoints>
    <Certificates>
      <Certificate name="Microsoft.WindowsAzure.Plugins.RemoteAccess.PasswordEncryption" storeLocation="LocalMachine" storeName="My" />
    </Certificates>
  </WebRole>
</ServiceDefinition>
```