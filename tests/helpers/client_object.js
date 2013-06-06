var async = require('async');

// Helper module to convert the
// client data into a single JS object.
// Used for testing.

// Retrieves all notes.

function allNotes(db, cb) {
    var sql = 'SELECT * FROM note ORDER BY uuid';
    db.all(sql, cb);
}

// Retrieves all comments.

function allComments(db, cb) {
    var sql = 'SELECT * FROM comment ORDER BY uuid';
    db.all(sql, cb);
}

// Converts all client data into large js object.

module.exports = function(db, cb) {
    async.waterfall([
        function(cb) {
            async.series([
                async.apply(allNotes, db),
                async.apply(allComments, db)
            ], cb);
        },
        function(data, cb) {
            cb(null, { notes: data[0], comments: data[1] });
        }
    ], cb);
};
