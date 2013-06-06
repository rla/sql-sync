BEGIN TRANSACTION;

-- Generic table for storing sync actions.
-- Last action with on the row always takes precedence.

CREATE TABLE sync (
    action INTEGER NOT NULL, -- 0 - insert/modify, 1 - delete
    keyval CHARACTER(36) NOT NULL, -- table key
    tid INTEGER NOT NULL, -- table id
    PRIMARY KEY (keyval) ON CONFLICT REPLACE
);

-- Metainfo about the synced tables.

CREATE TABLE sync_table (
    tid INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    keycol VARCHAR(255) NOT NULL,
    PRIMARY KEY (tid),
    UNIQUE (name)
);

INSERT INTO sync_table (tid, name, keycol) VALUES (0, 'note', 'uuid');
INSERT INTO sync_table (tid, name, keycol) VALUES (1, 'comment', 'uuid');

-- Keeps client side revision number.
-- This is not changed during data operations.
-- It is only used when communicating with the server.

CREATE TABLE revision (
    rev UNSIGNED BIG INT NOT NULL
);

INSERT INTO revision (rev) VALUES (0);

-- Triggers on the note table.

CREATE TRIGGER note_insert
AFTER INSERT ON note FOR EACH ROW
BEGIN
    INSERT INTO sync (action, keyval, tid)
    VALUES (0, NEW.uuid, 0);
END;

CREATE TRIGGER note_update
AFTER UPDATE ON note FOR EACH ROW
BEGIN
    INSERT INTO sync(action, keyval, tid)
    VALUES (1, OLD.uuid, 0);
    INSERT INTO sync(action, keyval, tid)
    VALUES (0, NEW.uuid, 0);
END;

CREATE TRIGGER note_delete
AFTER DELETE ON note FOR EACH ROW
BEGIN
    INSERT INTO sync(action, keyval, tid)
    VALUES (1, OLD.uuid, 0);
END;

-- Triggers on the comment table.

CREATE TRIGGER comment_insert
AFTER INSERT ON comment FOR EACH ROW
BEGIN
    INSERT INTO sync (action, keyval, tid)
    VALUES (0, NEW.uuid, 1);
END;

CREATE TRIGGER comment_update
AFTER UPDATE ON comment FOR EACH ROW
BEGIN
    INSERT INTO sync(action, keyval, tid)
    VALUES (1, OLD.uuid, 1);
    INSERT INTO sync(action, keyval, tid)
    VALUES (0, NEW.uuid, 1);
END;

CREATE TRIGGER comment_delete
AFTER DELETE ON comment FOR EACH ROW
BEGIN
    INSERT INTO sync(action, keyval, tid)
    VALUES (1, OLD.uuid, 1);
END;

COMMIT TRANSACTION;