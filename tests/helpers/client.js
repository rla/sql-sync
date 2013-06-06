var sqlite3 = require('sqlite3').verbose();

exports.make = function(file) {
    return new sqlite3.Database(file);
};
