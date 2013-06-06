var server = require('./helpers/server');
var client = require('./helpers/client');
var serverSync = require('../lib/server_sync');
var clientSync = require('../lib/client_sync');
var serverObject = require('./helpers/server_object');
var clientObject = require('./helpers/client_object');
var serverData = require('./helpers/server_data');
var clientData = require('./helpers/client_data');
var assert = require('assert');
var async = require('async');

function syncAndCheck(serverCon, clientDb, cb) {
    async.waterfall([
        function(cb) {
            clientSync.findChanges(clientDb, cb);
        },
        function(clientChanges, cb) {
            serverSync.sync(serverCon, clientChanges, cb);
        },
        function(serverChanges, cb) {
            clientSync.applyChanges(clientDb, serverChanges, cb);
        },
        function(cb) {
            serverObject(serverCon, cb);
        },
        function(sobj, cb) {
            clientObject(clientDb, function(err, cobj) {
                cb(err, sobj, cobj);
            });
        },
        function(sobj, cobj, cb) {
            check(sobj, cobj);
            cb();
        }
    ], function(err) {
        assert.ifError(err);
        cb(err);
    });
}

// Checks consistency between the
// two clients.

function checkClients(clientDb1, clientDb2, cb) {
    async.series([
        async.apply(clientObject, clientDb1),
        async.apply(clientObject, clientDb2)
    ], function(err, results) {
        assert.ifError(err);
        check(results[0], results[1]);
        cb(err);
    });
}

function check(server, client) {
    //console.log('Server: %s', JSON.stringify(server.comments));
    //console.log('Client: %s', JSON.stringify(client.comments));
    console.log('Server notes length: %s', server.notes.length);
    console.log('Client notes length: %s', client.notes.length);
    console.log('Server comments length: %s', server.comments.length);
    console.log('Client comments length: %s', client.comments.length);
    assert.deepEqual(server, client);
}

describe('Sync', function() {

    var db1, db2;

    it('should start new clients', function() {
        db1 = client.make(__dirname + '/../tmp/c1.sqlite');
        db2 = client.make(__dirname + '/../tmp/c2.sqlite');
    });

    it('should have c1 make random operations', function(done) {
        clientData.randomOps(db1, function(err) {
            assert.ok(!err);
            done();
        });
    });

    it('should have c2 make random operations', function(done) {
        clientData.randomOps(db2, function(err) {
            assert.ok(!err);
            done();
        });
    });

    it('should have server make random operations', function(done) {
        serverData.randomOps(server.connection, done);
    });

    it('should sync db1 with the server', function(done) {
        syncAndCheck(server.connection, db1, done);
    });

    it('should sync db2 with the server', function(done) {
        syncAndCheck(server.connection, db2, done);
    });

    it('should sync db1 with the server', function(done) {
        syncAndCheck(server.connection, db1, done);
    });

    it('should have db1 and db2 consistent', function(done) {
        checkClients(db1, db2, done);
    });

    it('should have server make random operations again', function(done) {
        serverData.randomOps(server.connection, done);
    });

    it('should sync db1 with the server', function(done) {
        syncAndCheck(server.connection, db1, done);
    });

    it('should sync db2 with the server', function(done) {
        syncAndCheck(server.connection, db2, done);
    });

    it('should have db1 and db2 consistent', function(done) {
        checkClients(db1, db2, done);
    });

    it('should end all connections', function() {
        db1.close();
        db2.close();
        server.connection.end();
    });
}); 
