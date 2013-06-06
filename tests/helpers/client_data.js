var uuid = require('node-uuid');
var async = require('async');

// Creates a random note.

function insertRandomNote(db, cb) {
    var sql = 'INSERT INTO note (uuid, title, content)' +
        ' VALUES (?, ?, ?)';
    var params = [ uuid.v4(), 'Test', 'Test test' ];
    db.run(sql, params, cb);
}

// Creates and inserts random comment.

function insertRandomComment(db, cb) {
    async.waterfall([
        async.apply(randomNoteUuid, db),
        async.apply(insertNoteComment, db)
    ], cb);
}

// Adds random comment to the given note.

function insertNoteComment(db, noteUuid, cb) {
    var params = [ uuid.v4(), noteUuid, 'Comment xx', 'Large text' ];
    var sql = 'INSERT INTO comment (uuid, note_uuid, title, content)' +
        ' VALUES (?, ?, ?, ?)';
    db.run(sql, params, cb);
}

// Deletes given note from the client
// database.

function deleteNote(db, uuid, cb) {
    var sql = 'DELETE FROM note WHERE uuid = ?';
    db.run(sql, [ uuid ], cb);
}

// Deletes given note comments.
// This could abso be done with foreign keys
// and ON DELETE CASCADE.

function deleteNoteComments(db, uuid, cb) {
    var sql = 'DELETE FROM comment WHERE note_uuid = ?';
    db.run(sql, [ uuid ], cb);
}

// Deletes random note.

function deleteRandomNote(db, cb) {
    async.waterfall([
        async.apply(randomNoteUuid, db),
        function(uuid, cb) {
            async.series([
                async.apply(deleteNoteComments, db, uuid),
                async.apply(deleteNote, db, uuid)
            ], cb);
        }
    ], cb);
}

// Finds uuid of a random note.

function randomNoteUuid(db, cb) {
    var sql = 'SELECT uuid FROM note ORDER BY RANDOM() LIMIT 1';
    db.get(sql, function(err, result) {
        cb(err, result.uuid);
    });
}

// Helper to start SQLite transaction.

function beginTransaction(db, cb) {
    db.run('BEGIN TRANSACTION', cb);
}

// Helper to stop SQLite transaction.

function endTransaction(db, cb) {
    db.run('COMMIT TRANSACTION', cb);
}

// Runs random operations on the client.

exports.randomOps = function(db, cb) {
    async.series([
        async.apply(beginTransaction, db),
        async.apply(insertRandomNote, db),
        async.apply(insertRandomNote, db),
        async.apply(insertRandomNote, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(insertRandomComment, db),
        async.apply(deleteRandomNote, db),
        async.apply(endTransaction, db)
    ], cb);
};