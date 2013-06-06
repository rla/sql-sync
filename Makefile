JS = $(wildcard *.js) $(wildcard lib/*.js) $(wildcard tests/*.js) $(wildcard tests/helpers/*.js)

client: tmp/test.sqlite tmp/c1.sqlite tmp/c2.sqlite

tmp/%.sqlite: tmp/client.sql
	cat $< | sqlite3 $@
	
tmp/client.sql: schema/client/schema.sql schema/client/sync.sql
	cat $+ > $@

tmp/server.sql: schema/server/database.sql schema/server/schema.sql schema/server/sync.sql
	cat $+ > $@

server: tmp/server.sql
	cat $< | mysql \
		--show-warnings \
		--default-character-set=utf8 \
		--batch \
		--disable-auto-rehash \
		--user=test \
		--password=test \
		--host=mysql

test-sync:
	mocha tests/sync.js

test: check clean client server test-sync

check: $(JS)
	jshint $+

clean:
	rm -f tmp/*
	rm -rf docs/*

docs:
	docco -o docs -l parallel $(JS)
	
upload-docs: docs
	ssh www-data@infdot.com mkdir -p /var/www/doc/sql-sync
	scp docs/* www-data@infdot.com:/var/www/doc/sql-sync

.PHONY: clean sqlite server test test-server test-client test-sync check docs upload-docs
