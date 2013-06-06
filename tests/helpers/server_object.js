var async = require('async');
var query = require('../../lib/server_help').query;

// Helper module to convert all
// server data into a JS object.

// Retrieves all notes.

function allNotes(con, cb) {
    var sql = 'SELECT * FROM note ORDER BY uuid';
    query(con, sql, cb);
}

// Retrieves all comments.

function allComments(con, cb) {
    var sql = 'SELECT * FROM comment ORDER BY uuid';
    query(con, sql, cb);
}

// Converts all server data into a large js object.

module.exports = function(con, cb) {
    async.waterfall([
        function(cb) {
            async.series([
                async.apply(allNotes, con),
                async.apply(allComments, con)
            ], cb);
        },
        function(results, cb) {
            cb(null, { notes: results[0], comments: results[1] });
        }
    ], cb);
};