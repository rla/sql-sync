var mysql = require('mysql');

// Creates MySQL connection to the server.

var connection = exports.connection = mysql.createConnection({
    host: 'mysql',
    user: 'test',
    password: 'test'
});

connection.connect();
connection.query('USE sync');
