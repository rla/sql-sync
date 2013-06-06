var async = require('async');
var query = require('./server_help').query;
var mysql = require('mysql');

// Selects the current timestamp.

var currentRev = exports.currentRev = function(con, cb) {
    var sql = 'SELECT rev FROM revision';
    async.waterfall([
        async.apply(query, con, sql),
        function(result, cb) {
            cb(null, result[0].rev);
        }
    ], cb);
};

// Finds all synced tables.

var findTables = exports.findTables = function(con, cb) {
    var sql = 'SELECT tid, name, keycol' +
        ' FROM sync_table ORDER BY name';
    query(con, sql, cb);
};

// Finds all deletes.

function findTableDeletes(con, since, to, table, cb) {
    async.waterfall([
        function(cb) {
            var sql = 'SELECT keyval FROM sync' +
                ' WHERE action = 1 AND rev > ? AND rev <= ?' +
                ' AND tid = ? ORDER BY keyval';
            var params = [ since, to, table.tid ];
            query(con, sql, params, cb);
        },
        function(results, cb) {
            cb(null, results.map(function(row) { return row.keyval; }));
        }
    ], cb);
}

// Finds all changes for the given table.
// This uses mysql.escapeId() function to
// safely handle dynamic table and column names.

function findTableChanges(con, since, to, table, cb) {
    var sql = 'SELECT ' + mysql.escapeId(table.name) + '.*' +
        ' FROM ' + mysql.escapeId(table.name) +
        ' JOIN sync ON (' + mysql.escapeId(table.name) +
        '.' + mysql.escapeId(table.keycol) + ' = sync.keyval)' +
        ' WHERE sync.action = 0 AND sync.rev > ?' +
        ' AND sync.rev <= ?' +
        ' AND sync.tid = ? ORDER BY ' + mysql.escapeId(table.keycol);
    var params = [ since, to, table.tid ];
    query(con, sql, params, cb);
}

// Finds both deletes and changes for
// the table.

function findAllTableChanges(con, since, to, table, cb) {
    async.waterfall([
        function(cb) {
            async.series([
                async.apply(findTableDeletes, con, since, to, table),
                async.apply(findTableChanges, con, since, to, table)
            ], cb);
        },
        function(results, cb) {
            cb(null, { deletes: results[0], changes: results[1] });
        }
    ], cb);
}

// Finds all changes.

var findChanges = exports.findChanges = function(con, since, to, tables, cb) {
    var changes = {};
    async.eachSeries(tables, function(table, cb) {
        findAllTableChanges(con, since, to, table, function(err, tableChanges) {
            changes[table.name] = tableChanges;
            cb(err);
        });
    }, function(err) {
        cb(err, changes);
    });
};

// Creates INSERT ... ON DUPLICATE KEY UPDATE statement
// for the given data object and table. Assumes that
// the data object is completely valid. Does not check.

function insertOrUpdateRow(con, data, table, cb) {
    if (!data.hasOwnProperty(table.keycol)) {
        return cb(new Error('Data object has no key field.'));
    }
    var keys = Object.keys(data);
    var placeholders = keys.map(function() { return '?'; });
    var params = keys.map(function(key) { return data[key]; });
    var updates = keys.slice(0);
    updates.splice(keys.indexOf(table.keycol), 1);
    function updateByColVal(col) {
        return mysql.escapeId(col) + ' = VALUES(' + mysql.escapeId(col) + ')';
    }
    var sql = 'INSERT INTO ' + mysql.escapeId(table.name) + '(' +
        keys.map(mysql.escapeId).join(', ') + ') VALUES (' + placeholders.join(', ') + ')' +
        ' ON DUPLICATE KEY UPDATE ' + updates.map(updateByColVal).join(', ');
    query(con, sql, params, cb);
}

// Deletes all rows from the given table.
// This is generic convenience function.
// uuids - array of row keys
// table - name of the table

function applyTableDeletes(con, uuids, table, cb) {
    if (!Array.isArray(uuids)) {
        return cb(new Error('First argument must be an array.'));
    }
    console.log('Table %s has %s deletes.', table.name, uuids.length);
    async.eachSeries(uuids, function(uuid, cb) {
        if (typeof uuid !== 'string' && typeof uuid !== 'number') {
            return cb(new Error('Key must be a string or a number.'));
        }
        var sql = 'DELETE FROM ' + mysql.escapeId(table.name) +
            ' WHERE ' + mysql.escapeId(table.keycol) + ' = ?';
        query(con, sql, [ uuid ], cb);
    }, cb);
}

// Applies all changes to the given table.
// This is generic convenience function.
// changes - array on data objects.

function applyTableChanges(con, changes, table, cb) {
    console.log('Table %s has %s changes.', table.name, changes.length);
    async.eachSeries(changes, function(change, cb) {
        insertOrUpdateRow(con, change, table, cb);
    }, cb);
}

// changes - object with keys named by tables.

function applyAllChanges(con, changes, tables, cb) {
    async.eachSeries(tables, function(table, cb) {
        async.series([
            async.apply(applyTableChanges, con, changes[table.name].changes || [], table),
            async.apply(applyTableDeletes, con, changes[table.name].deletes || [], table)
        ], cb);
    }, cb);
}

function lockTables(con, tables, cb) {
    var tableLocks = tables.map(function(table) {
        return mysql.escapeId(table.name) + ' WRITE';
    }).join(', ');
    query(con, 'LOCK TABLES sync_table READ, sync WRITE, ' + tableLocks, cb);
}

// Unlocks all currently held table locks.

function unlockTables(con, cb) {
    query(con, 'UNLOCK TABLES', cb);
}

// Synchronizes client data with the server data.
// cb must accept rev and changes.

exports.sync = function(con, changes, cb) {
    var crrev, nwrev, outchanges, tables;
    var start = Date.now();
    var clrev = changes.revision;
    console.log('Client revision: %s', clrev);
    async.series([
        function(cb) {
            // Finds the names of tables that have to be synced.
            findTables(con, function(err, results) {
                tables = results;
                console.log('Synced tables: %s', tables.map(function(table) { return table.name; }).join(', '));
                cb(err);
            });
        },
        function(cb) {
            // Locks tables. Prevents updates by other
            // connections.
            lockTables(con, tables, cb);
        },
        function(cb) {
            // Finds the current server revision.
            currentRev(con, function(err, rev) {
                console.log('Server revision before sync: ' + rev);
                crrev = rev;
                cb(err);
            });
        },
        function(cb) {
            // Applies all changes from the client.
            applyAllChanges(con, changes, tables, cb);
        },
        function(cb) {
            // Finds current revision on the server.
            // This is sent back to the client.
            currentRev(con, function(err, rev) {
                console.log('Server revision after sync: ' + rev);
                nwrev = rev;
                cb(err);
            });
        },
        function(cb) {
            // Finds changes on the server that were made
            // before the current syncing session.
            findChanges(con, clrev, crrev, tables, function(err, results) {
                outchanges = results;
                tables.forEach(function(table) {
                    console.log('Table %s outgoing changes: %s', table.name, outchanges[table.name].changes.length);
                    console.log('Table %s outgoing deletes: %s', table.name, outchanges[table.name].deletes.length);
                });
                cb(err);
            });
        }
    ], function(err) {
        // Unlocks tables.
        unlockTables(con, function(lerr) {
            console.log('Syncing took: %s ms', (Date.now() - start));
            outchanges.revision = nwrev;
            cb(err || lerr, outchanges);
        });
    });
};