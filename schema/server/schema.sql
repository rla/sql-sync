CREATE TABLE note(
    uuid CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT DEFAULT NULL,
    PRIMARY KEY (uuid)
);

-- 1:n relationship with note

CREATE TABLE comment (
    uuid CHAR(36) NOT NULL,
    note_uuid CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT DEFAULT NULL,
    PRIMARY KEY(uuid)
);