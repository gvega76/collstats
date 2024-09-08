// Modify first two lines 
var StatsOnlyForDB ="sample_training"
var clusterName = "USPROD-2"
var cluster = GetClustersSummary()
if ( typeof EJSON === "undefined" ) {
 var data = JSON.stringify(cluster);
}
else {
var data = EJSON.serialize(cluster)
}
print(data)

function GetClustersSummary() {
  var cluster = { "cluster": clusterName, "databases": [],
    "createdAt" : new Date()  };
  doc = db.serverStatus();
  cluster["host"] = doc["host"];
  cluster["process"] = doc["process"];
  cluster["hostInfo"] = db.getSiblingDB("admin").runCommand({ "hostInfo": 1 });
  cluster["buildInfo"] = db.getSiblingDB("admin").runCommand({ "buildInfo": 1 }).version;
  // cluster["serverStatus"] =  doc;
  if ( "repl" in doc) {
    cluster["replSetGetStatus"] = db.getSiblingDB("admin").runCommand({ "replSetGetStatus": 1 });
  }
  if (doc["process"] == "mongos") {
    cluster["topology"] = "sharded";
    var shards = db.getSiblingDB("admin").runCommand({ "listShards": 1 });
    cluster["shards"] = shards["shards"];
  } else if (doc["repl"] != null) {
    cluster["topology"] = "replica";
    var node = { "host": doc["host"]  };
    var shard = { "_id": doc["repl"]["setName"], "servers": [] };
    node["buildInfo"] = cluster["buildInfo"];
    node["hostInfo"] = cluster["hostInfo"];
    node["serverStatus"] = doc // cluster["serverStatus"];
    shard.servers.push(node);
    cluster["shards"] = [];
    cluster["shards"].push(shard);
  } else {
    cluster["topology"] = "standalone";
  }
  cluster["databases"] = GetDatabases();
  return cluster;
}



function GetDatabases() {
  var databases = [];
  var doc = { "databases": [{ "name": StatsOnlyForDB }] };
  if ( StatsOnlyForDB == "" ) {
    doc = db.adminCommand( { listDatabases: 1 } );
  }
  dbnames = doc["databases"];
  dbnames.forEach(function(database) {
    if(database["name"] == "admin" || database["name"] == "config" || database["name"] == "local" ) {
      // skip
    } else {
      collections = [];
      var dbname = database["name"];
      names = db.getSiblingDB(dbname).getCollectionNames();
      names.sort();
      names.forEach(function(name) {
         if ( ! name.startsWith("system" )) {
        
        var stats =	db.getSiblingDB(dbname).getCollection(name).stats( { "indexDetails" : true });
        var latencyStats = db.getSiblingDB(dbname).getCollection(name).aggregate( {$collStats : { latencyStats : { histograms : true } } }).toArray()    
        simpifiedIndexStats = []
        for (var key in stats.indexDetails) {
          simpifiedIndexStats.push({
            "key" : key,
            "cache" : stats.indexDetails[key].cache,
            "cache_walk" : stats.indexDetails[key].cache_walk,
            "cursor" : stats.indexDetails[key].cursor
          }
        ) }
        var simplefiedStats = stats
        simplefiedStats.wiredTiger = {
           "cache" : stats.wiredTiger.cache,
           "cursor" : stats.wiredTiger.cursor }
        simplefiedStats.latencyStats  =  latencyStats
        simplefiedStats.indexDetails =  simpifiedIndexStats
        
        collections.push({"namespace": dbname+"."+name, "name": name, 
          "indexes": GetIndexesFromCollection(dbname, name), "stats": simplefiedStats});
        }
      });
      var stats = db.getSiblingDB(dbname).runCommand( { "dbStats": 1 });
      databases.push({ "name": dbname, "collections": collections, "stats": stats});
    }
  });
  return databases;
}

function GetIndexesFromCollection(dbname, name) {
  var indexes = [];
  var istats = db.getSiblingDB(dbname).getCollection(name).aggregate([ {"$indexStats": {}} ]);
  var docs = [];
  istats.forEach(function(doc) {
    docs.push(doc);
    var index = { "totalOps": 0 };
    index["name"] = doc["name"];
    index["spec"] = doc["spec"];
    index["keystring"] = JSON.stringify(doc["key"]).replace(/"/g, "");
    var str = JSON.stringify(doc["key"]).replace(":-1", ":1").replace(/"/g, "");
    index["effectiveKey"] = str.substring(1, str.length-1);
    index["usage"] = [];
    indexes.push(index)
  });

  for(var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var exists = false;

    for(var j = 0; j < indexes.length; j++) {
      var index = indexes[j];
      if (index["name"] == doc["name"] ) {  // found
        var access = doc["accesses"];
        indexes[j]["totalOps"] += Number(access["ops"])
        indexes[j]["usage"].push({ "host": doc["host"], "accesses": {"since": access["since"], "ops": Number(access["ops"])}});
        exists = true;
        break;
      }
    }

    if (exists == false) { // not found, push
      var access = doc["accesses"];
      doc = doc["spec"];
      doc["keystring"] = JSON.stringify(doc["key"]).replace(/"/g, "");
      var str = JSON.stringify(doc["keystring"]).replace(":-1", ":1").replace(/"/g, "");
      doc["effectiveKey"] = str.substring(1, str.length-1);
      doc["totalOps"] = Number(access["ops"]);
      doc["usage"] = [];
      doc["usage"].push({ "host": doc["host"], "accesses": {"since": access["since"], "ops": Number(access["ops"])}});
      indexes.push(doc);
    }
  }
  return indexes;
}
