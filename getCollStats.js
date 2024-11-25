var output = db.adminCommand( { listDatabases: 1, nameOnly: true} );
var dbs = [];
var configDB = db.getSiblingDB("config");

var sysColls = ["system.roles", "system.users", "system.version", "system.namespaces", "system.indexes", "system.profile", "system.js", "system.views","system."];

for (var i = 0; i < output.databases.length; i++) {
    if ( output.databases[i].name == "admin"
     || output.databases[i].name == "local"
     || output.databases[i].name == "config" ) {
      continue;
    }

    dbs.push(output.databases[i].name);
}

for (var i = 0; i < dbs.length; i++) {
    var currDB = db.getSiblingDB(dbs[i]);
    var colls = currDB.getCollectionInfos();
    for (var j = 0; j < colls.length; j++) {
        if (sysColls.includes(colls[j].name)) {
          continue;
        }
        if ( colls[j].type == "view") {
            continue;
        }

        var currColl = currDB.getCollection(colls[j].name);
        var stats = {}
        if (! (colls[j].type) || colls[j].type == "collection") {
            stats = currColl.stats();

            var latencyStats = currColl.aggregate( {$collStats : { latencyStats : { histograms : true } } }).toArray()
            stats.latencyStats =  latencyStats

            delete stats.wiredTiger;
            if (stats.shards) {
                for (var shard in stats.shards) {
                    if (stats.shards[shard].wiredTiger) {
                        delete stats.shards[shard].wiredTiger;
                    }
                }
            }
            stats.indexDefinitions = currColl.getIndexes();
            stats.indexUsage = [];

            var idxStats = currColl.aggregate([{$indexStats: {}}]);
            while (idxStats.hasNext()) {
                stats.indexUsage.push(idxStats.next());
            }

            //get shard Key definition
            var shardMD = configDB.collections.findOne({_id: (dbs[i] + "." + colls[j].name), dropped:false});
            if (shardMD) {
                stats.shardKey = shardMD.key
            }
            delete shardMD;

        } else {
            stats.ns = dbs[i] + "." + colls[j].name;
            stats.pipeline = colls[j].options.pipeline;
        }
        printjson(stats)
    }

}
