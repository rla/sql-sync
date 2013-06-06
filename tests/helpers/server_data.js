var uuid = require('node-uuid');
var async = require('async');
var query = require('../../lib/server_help').query;

// Helper module to generate random
// data on the server side.

// Inserts a random note into the server
// database.

var insertRandomNote = exports.insertRandomNote = function(con, cb) {
    var sql = 'INSERT INTO note (uuid, title, content)' +
        ' VALUES (?, ?, ?)';
    var params = [ uuid.v4(), 'Test', 'Test test' ];
    query(con, sql, params, cb);
};

// Creates and inserts random comment.

function insertRandomComment(con, cb) {
    async.waterfall([
        async.apply(randomNoteUuid, con),
        function(uuid, cb) {
            insertNoteComment(con, uuid, cb);
        }
    ], cb);
}

// Adds random comment to the given note.

function insertNoteComment(con, noteUuid, cb) {
    var params = [ uuid.v4(), noteUuid, 'Comment xx', 'Large text' ];
    var sql = 'INSERT INTO comment (uuid, note_uuid, title, content)' +
        ' VALUES (?, ?, ?, ?)';
    query(con, sql, params, cb);
}

// Finds uuid of a random note.

function randomNoteUuid(con, cb) {
    var sql = 'SELECT uuid FROM note ORDER BY RAND() LIMIT 1';
    query(con, sql, function(err, result) {
        cb(err, result[0].uuid);
    });
}

// Deletes given note from the client
// database.

function deleteNote(con, uuid, cb) {
    var sql = 'DELETE FROM note WHERE uuid = ?';
    query(con, sql, [ uuid ], cb);
}

// Deletes given note comments.

function deleteNoteComments(con, uuid, cb) {
    var sql = 'DELETE FROM comment WHERE note_uuid = ?';
    query(con, sql, [ uuid ], cb);
}

// Deletes random note.

function deleteRandomNote(con, cb) {
    async.waterfall([
        async.apply(randomNoteUuid, con),
        function(uuid, cb) {
            async.series([
                async.apply(deleteNoteComments, con, uuid),
                async.apply(deleteNote, con, uuid)
            ], cb);
        }
    ], cb);
}

// Runs random operations on the server.

exports.randomOps = function(con, cb) {
    async.series([
        async.apply(insertRandomNote, con),
        async.apply(insertRandomNote, con),
        async.apply(insertRandomNote, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(insertRandomComment, con),
        async.apply(deleteRandomNote, con)
    ], cb);
};