var async = require('async');

// Helper to start SQLite transaction.

function beginTransaction(db, cb) {
    db.run('BEGIN TRANSACTION', cb);
}

// Helper to stop SQLite transaction.

function endTransaction(db, cb) {
    db.run('COMMIT TRANSACTION', cb);
}

// Finds all synced tables.

function findTables(db, cb) {
    var sql = 'SELECT tid, name, keycol' +
        ' FROM sync_table ORDER BY name';
    db.all(sql, cb);
}

// Finds deletes on the given table.
// Returns array of key values.

function findTableDeletes(db, table, cb) {
    async.waterfall([
        function(cb) {
            var sql = 'SELECT keyval FROM sync' +
                ' WHERE action = 1 AND tid = ? ORDER BY keyval';
            db.all(sql, [ table.tid ], cb);
        },
        function(rows, cb) {
            cb(null, rows.map(function(row) { return row.keyval; }));
        }
    ], cb);
}

// Finds table changes. Assumes that the view
// *_changes exists in the database.

function findTableChanges(db, table, cb) {
    var sql = 'SELECT ' + table.name + '.*' +
        ' FROM ' + table.name +
        ' JOIN sync ON (' + table.name + '.' + table.keycol + ' = sync.keyval)' +
        ' WHERE sync.action = 0 AND sync.tid = ?' +
        ' ORDER BY ' + table.keycol;
    db.all(sql, [ table.tid ], cb);
}

// Finds both deletes and changes for
// the table.

function findAllTableChanges(db, table, cb) {
    async.waterfall([
        function(cb) {
            async.series([
                async.apply(findTableDeletes, db, table),
                async.apply(findTableChanges, db, table)
            ], cb);
        },
        function(results, cb) {
            cb(null, { deletes: results[0], changes: results[1] });
        }
    ], cb);
}

// Finds current revision stored on the
// client side.

function findRev(db, cb) {
    var sql = 'SELECT rev FROM revision';
    db.get(sql, function(err, result) {
        cb(err, result.rev);
    });
}

// Finds all changes and the last
// revision number.
// To cb will be passed err, changes

exports.findChanges = function(db, cb) {
    async.series([
        async.apply(findRev, db),
        function(cb) {
            async.waterfall([
                async.apply(findTables, db),
                function(tables, cb) {
                    var changes = {};
                    async.eachSeries(tables, function(table, cb) {
                        findAllTableChanges(db, table, function(err, tableChanges) {
                            changes[table.name] = tableChanges;
                            cb(err);
                        });
                    }, function(err) {
                        cb(err, changes);
                    });
                }
            ], cb);
        }
    ], function(err, results) {
        var changes = results[1];
        changes.revision = results[0];
        cb(err, changes);
    });
};

// Deletes all rows from the given table.
// This is generic convenience function.
// keyvals - array of row keys
// table - name of the table

function applyTableDeletes(db, keyvals, table, cb) {
    async.eachSeries(keyvals, function(keyval, cb) {
        if (typeof keyval !== 'string' && typeof keyval !== 'number') {
            cb(new Error('Delete key must be a string or a number.'));
        }
        var sql = 'DELETE FROM ' + table.name +
            ' WHERE ' + table.keycol + ' = ?';
        db.run(sql, [ keyval ], cb);
    }, cb);
}

// Applies all changes to the given table.
// This is generic convenience function.
// changes - array on data objects.
//
// The function performs an operation that is also
// known as UPSERT in other database systems.

function applyTableChanges(db, changes, table, cb) {
    async.eachSeries(changes, function(change, cb) {
        async.series([
            async.apply(insertOrIgnoreRow, db, change, table),
            async.apply(updateRow, db, change, table)
        ], cb);
    }, cb);
}

// Creates INSERT OR IGNORE statement for the
// given data object and table. Assumes that
// the data object is completely valid. Does not check.

function insertOrIgnoreRow(db, data, table, cb) {
    var keys = Object.keys(data);
    var placeholders = keys.map(function() { return '?'; });
    var params = keys.map(function(key) { return data[key]; });
    var sql = 'INSERT OR IGNORE INTO ' + table.name +
        ' (' + keys.join(', ') + ') VALUES (' + placeholders.join(', ') + ')';
    db.run(sql, params, cb);
}

// Creates UPDATE statement for the given
// data object and the table. Assumes that
// the data object is completely valid. Does not check.

function updateRow(db, data, table, cb) {
    if (typeof data[table.keycol] === 'undefined') {
        return cb(new Error('Data object must contain key value property.'));
    }
    var keys = Object.keys(data);
    keys.splice(keys.indexOf(table.keycol), 1); // removes the key column
    var updates = keys.map(function(key) { return key + ' = ?'; });
    var params = keys.map(function(key) { return data[key]; });
    params.push(data[table.keycol]);
    var sql = 'UPDATE ' + table.name + ' SET ' + updates.join(', ') +
        ' WHERE ' + table.keycol + ' = ?';
    db.run(sql, params, cb);
}

// Removes current sync metadata.
// Used after each successful synchronization
// with the server.
// rev - the last server revision number, sent by the server.

function resetSync(db, rev, cb) {
    async.series([
        function(cb) { db.run('DELETE FROM sync', cb); },
        function(cb) { db.run('UPDATE revision SET rev = ?', [ rev ], cb); }
    ], cb);
}

// changes - object with keys named by tables.

function applyAllChanges(db, changes, cb) {
    async.waterfall([
        async.apply(findTables, db),
        function(tables, cb) {
            async.eachSeries(tables, function(table, cb) {
                async.series([
                    async.apply(applyTableChanges, db, changes[table.name].changes || [], table),
                    async.apply(applyTableDeletes, db, changes[table.name].deletes || [], table)
                ], cb);
            }, cb);
        }
    ], cb);
}

// Applies changes from the server.
// rev - the last server revision number, sent by the server.

exports.applyChanges = function(db, changes, cb) {
    async.series([
        async.apply(beginTransaction, db),
        async.apply(applyAllChanges, db, changes),
        async.apply(resetSync, db, changes.revision),
        async.apply(endTransaction, db)
    ], function(err) {
        cb(err);
    });
};