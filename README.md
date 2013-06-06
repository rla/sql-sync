sql-sync
========

Offline replication between SQLite (clients) and MySQL (master). This
project is not a library, rather it is example code. Some parts of it
(code in `lib`) could be reused in other projects. The code mainly
just tests that the approach described here works. The code is built
for Node.JS.

Assumes the following:

* Primary keys are [UUIDs](http://en.wikipedia.org/wiki/Uuid) (here 36-character strings);
* No foreign key constraints.

It is possible to use foreign key constraints but then table
updates must be reordered correctly (complicates the code a lot!).

It is possible to use [natural keys](http://en.wikipedia.org/wiki/Natural_key)
instead of UUIDs but there do not always exist good natural keys.
In most cases large composite keys would have to be used.
It is not possible to use autoincremented keys because of key value conflicts.

Metainfo
--------

On the client side table actions (INSERT/UPDATE/DELETE) are recorded
into the metadata table `sync` with the following structure:

    CREATE TABLE sync (
        action INTEGER NOT NULL,
        keyval CHARACTER(36) NOT NULL,
        tid INTEGER NOT NULL,
        PRIMARY KEY (keyval) ON CONFLICT REPLACE
    );

In the table:

* action - 0 marks insert/update, 1 marks delete;
* keyval - primary key value in the row;
* tid - table id (used by triggers below).

Synced tables are kept in the table `sync_table`:

    CREATE TABLE sync_table (
        tid INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        keycol VARCHAR(255) NOT NULL,
        PRIMARY KEY (tid),
        UNIQUE (name)
    );

In the table:

* tid - table id.
* name - table name.
* keycol - name of primary key column in the table.

For each table in `sync_table` the following triggers have
to be created:

    CREATE TRIGGER <table>_insert
    AFTER INSERT ON <table> FOR EACH ROW
    BEGIN
        INSERT INTO sync (action, keyval, tid)
        VALUES (0, NEW.<keycol>, <tableid>);
    END;
    
    CREATE TRIGGER <table>_update
    AFTER UPDATE ON <table> FOR EACH ROW
    BEGIN
        INSERT INTO sync(action, keyval, tid)
        VALUES (1, OLD.<keycol>, <tableid>);
        INSERT INTO sync(action, keyval, tid)
        VALUES (0, NEW.<keycol>, <tableid>);
    END;
    
    CREATE TRIGGER <table>_delete
    AFTER DELETE ON <table> FOR EACH ROW
    BEGIN
        INSERT INTO sync(action, keyval, tid)
        VALUES (1, OLD.<keycol>, <tableid>);
    END;

A special table is used for storing the last revision number (given by the
server at the end of sync). This is sent with each sync request (but is not updated on
each data table action on the client):

    CREATE TABLE revision (
        rev UNSIGNED BIG INT NOT NULL
    );

Metainfo tables on the server are similar. The main difference is
in the `sync` table:

    CREATE TABLE sync (
        action TINYINT UNSIGNED NOT NULL,
        keyval CHAR(36) NOT NULL,
        tid TINYINT UNSIGNED NOT NULL,
        rev BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (keyval)
    );

The `rev` field is updated with each data table action. This is done with
the help of the following stored procedure:

    CREATE PROCEDURE sync_mark (
        in_keyval CHAR(36),
        in_tid TINYINT UNSIGNED,
        in_action VARCHAR(10)
    )
    BEGIN
        INSERT INTO sync (action, keyval, tid, rev)
        VALUES (
            in_action,
            in_keyval,
            in_tid,
            (SELECT rev + 1 FROM revision)
        ) ON DUPLICATE KEY UPDATE action = VALUES(action), rev = VALUES(rev);
        UPDATE revision SET rev = rev + 1;
    END

The procedure is called by triggers. They have to be created for
each data table:

    CREATE TRIGGER <table>_insert
    AFTER INSERT ON <table> FOR EACH ROW
    BEGIN CALL sync_mark(NEW.<keycol>, <tableid>, 0); END
    
    CREATE TRIGGER <table>_update
    AFTER UPDATE ON <table> FOR EACH ROW
    BEGIN
        CALL sync_mark(OLD.<keycol>, <tableid>, 1);
        CALL sync_mark(NEW.<keycol>, <tableid>, 0);
    END
    
    CREATE TRIGGER <table>_delete
    AFTER DELETE ON <table> FOR EACH ROW
    BEGIN CALL sync_mark(OLD.<keycol>, <tableid>, 1); END

General algorithm
-----------------

1. Client finds all changes.
2. Client finds all deletes.
3. Client finds **clrev**, the last revision the client synced with the server.
4. Client sends changes, deletes and **clrev** to server.
5. Server locks meta and data tables.
6. Server finds current revision **crrev**.
7. Server applies client changes and deletes.
8. Server finds current revison again, **nwrev**.
9. Server finds all changes between **clrev** and **crrev**.
10. Server finds all deletes between **clrev** and **crrev**.
11. Server unlocks tables.
12. Server sends changes, deletes and **nwrev** back to the client.
13. Client stores **nwrev**.

Finding changes on the client (this and others have to be
executed per data table):

    SELECT <table>.* FROM <table>
    JOIN sync ON (<table>.<keycol> = sync.keyval)
    WHERE sync.action = 0 AND sync.tid = <tableid>
    ORDER BY <keycol>;

Finding deletes on the client:

    SELECT keyval FROM sync
    WHERE action = 1 AND tid = <tableid> ORDER BY keyval;

Applying changes on the server (per row):

    INSERT INTO <table> (col1, col2, ...)
    VALUES (val1, val2, ...)
    ON DUPLICATE KEY UPDATE col1 = VALUES(col1),
    col2 = VALUES(col2), ...;

Applying deletes on the server (per deleted row):

    DELETE FROM <table> WHERE <keycol> = value;

Finding changes on the server:

    SELECT <table>.* FROM <table>
    JOIN sync ON (<table>.<keycol> = sync.keyval
    WHERE sync.action = 0 AND sync.rev > <clrev>
    AND sync.rev <= <crrev>
    AND sync.tid = <tableid> ORDER BY <keycol>;

Finding deletes on the server:

    SELECT keyval FROM sync
    WHERE action = 1 AND rev > <clrev>
    AND rev <= <crrev> AND tid = <tableid>
    ORDER BY keyval;

Applying changes on the client (per row, both
queries are needed):

    INSERT OR IGNORE INTO <table> (col1, col2, ...)
    VALUES (val1, val2, ...);
    UPDATE <table> SET col1 = val1, col2 = val2, ...
    WHERE <keycol> = value;

Applying deletes on the server (per deleted row):

    DELETE FROM <table>
    WHERE <keycol> = value;

Multiuser case
--------------

When data is kept by user (data tables contain some sort of user id)
then the `revision` table on the server side must also contain user id.
Queries on the server must take it into account (add to `WHERE` clauses
or `SET` user id when inserting). The procedure `sync_mark` has to be rewritten
to update by-user `rev` value.

Sync data over HTTP
-------------------

Both the server and the client send JSON object in the form:

    {
        "<table>": {
            "deletes": [ "keyval1", ... ],
            "changes": [
                {
                    "prop1": "value1",
                    "prop2": 23
                }
            ]
        },
        "revision": 120
    }

Running tests
-------------

Install dependencies:

    npm install

And install Mocha:

    npm install mocha -g

Modify MySQL connection details in `Makefile` and `tests/helpers/server.js`.
Run `make test`. Tests will create test schema in two clients and the server
and run various random operations in each. Then synchronize and check for
data consistency.

License
-------

The MIT License.

```
Copyright (c) 2013 Raivo Laanemets

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```
