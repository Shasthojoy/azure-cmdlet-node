var Table = require("cli-table");

module.exports = function (arrOfObjs) {
    if (!arrOfObjs || arrOfObjs.length === 0) {
        return "";
    }
    
    // instantiate
    var table = new Table({
        head: Object.keys(arrOfObjs[0])
    });
    
    arrOfObjs.forEach(function (obj) {
        table.push(Object.keys(obj).map(function (k) {
            return obj[k];
        }));
    });
    
    return table.toString();
};