BEGIN TRANSACTION;

CREATE TABLE note (
    uuid VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT DEFAULT NULL,
    PRIMARY KEY(uuid)
);

-- 1:n relationship with note

CREATE TABLE comment (
    uuid VARCHAR(255) NOT NULL,
    note_uuid VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT DEFAUL NULL,
    PRIMARY KEY(uuid)
);

COMMIT TRANSACTION;