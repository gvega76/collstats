
var StatsOnlyForDB ="sample_airbnb"
var clusterName = "USPROD-2"


function GetClustersSummary() {
  var cluster = { "cluster": clusterName, "databases": [],
    "createdAt" : new Date()  };
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
        

        collections.push({"namespace": dbname+"."+name, "name": name,
          "indexes": GetIndexesFromCollection(dbname, name)});
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


var cluster = GetClustersSummary()

if ( typeof EJSON === "undefined" ) {
 var data = JSON.stringify(cluster);
 // data = data.replace(/\$/g, '');
}
else {
var data = EJSON.serialize(cluster)
}
printjson(data)