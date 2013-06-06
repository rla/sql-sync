// Helper function to debug
// queries.

exports.query = function(con, sql, params, cb) {
    if (typeof params === 'function') {
        cb = params;
        params = [];
    }
    con.query(sql, params, function(err, results) {
        cb(err, results);
    });
};