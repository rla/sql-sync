CREATE TABLE sync (
    action TINYINT UNSIGNED NOT NULL, -- 0 - insert/modify, 1 - delete
    keyval CHAR(36) NOT NULL, -- table row key value
    tid TINYINT UNSIGNED NOT NULL, -- table identifier
    rev BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (keyval)
);

-- Metainfo about synced tables.

CREATE TABLE sync_table (
    tid TINYINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    keycol VARCHAR(255) NOT NULL,
    PRIMARY KEY (tid),
    UNIQUE (name)
);

INSERT INTO sync_table (tid, name, keycol) VALUES
(0, 'note', 'uuid'), (1, 'comment', 'uuid');

CREATE TABLE revision (
    rev BIGINT UNSIGNED NOT NULL
);

INSERT INTO revision (rev) VALUES (0);

delimiter |
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
|

CREATE TRIGGER note_insert
AFTER INSERT ON note FOR EACH ROW
BEGIN CALL sync_mark(NEW.uuid, 0, 0); END
|

CREATE TRIGGER note_update
AFTER UPDATE ON note FOR EACH ROW
BEGIN
    CALL sync_mark(OLD.uuid, 0, 1);
    CALL sync_mark(NEW.uuid, 0, 0);
END
|

CREATE TRIGGER note_delete
AFTER DELETE ON note FOR EACH ROW
BEGIN CALL sync_mark(OLD.uuid, 0, 1); END
|

CREATE TRIGGER comment_insert
AFTER INSERT ON comment FOR EACH ROW
BEGIN CALL sync_mark(NEW.uuid, 1, 0); END
|

CREATE TRIGGER comment_update
AFTER UPDATE ON comment FOR EACH ROW
BEGIN
    CALL sync_mark(OLD.uuid, 1, 1);
    CALL sync_mark(NEW.uuid, 1, 0);
END
|

CREATE TRIGGER comment_delete
AFTER DELETE ON comment FOR EACH ROW
BEGIN CALL sync_mark(OLD.uuid, 1, 1); END
|
delimiter ;