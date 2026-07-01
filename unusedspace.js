var results = [];
var totalCollectionReuseBytes = 0;
var totalIndexReuseBytes = 0;
var totalIndexSizeBytes = 0;
var namespacesWithUnavailableIndexDetails = 0;

db.getSiblingDB("admin").runCommand({ listDatabases : 1 } ).databases.forEach(d => {
  if (!["admin", "config", "local"].includes(d.name) && !d.name.startsWith("__mdb_internal")) {
    db.getSiblingDB(d.name).getCollectionNames().forEach( collectionName => {
      try {
        var doc = db.getSiblingDB(d.name).getCollection(collectionName).aggregate([
          { $collStats: { storageStats: {} } }
        ]).next();
        
        if (doc) {
          var ns = doc.ns || "";
          var collectionReuseBytes = 0;
          var indexReuseBytes = 0;
          var totalIndexSize = 0;
          var indexDetailsStatus = "available";

          if (
            doc.storageStats &&
            doc.storageStats.wiredTiger &&
            doc.storageStats.wiredTiger["block-manager"]
          ) {
            collectionReuseBytes =
              doc.storageStats.wiredTiger["block-manager"]["file bytes available for reuse"] || 0;
          }

          if (doc.storageStats) {
            totalIndexSize = doc.storageStats.totalIndexSize || 0;

            var indexDetails = doc.storageStats.indexDetails;

            if (!indexDetails) {
              indexDetailsStatus = "not_exposed";
            } else if (Array.isArray(indexDetails)) {
              indexDetails.forEach(function (idx) {
                idx = idx || {};
                if (idx["block-manager"]) {
                  indexReuseBytes += idx["block-manager"]["file bytes available for reuse"] || 0;
                }
              });
            } else if (typeof indexDetails === "object") {
              Object.keys(indexDetails).forEach(function (idxName) {
                var idx = indexDetails[idxName] || {};
                if (idx["block-manager"]) {
                  indexReuseBytes += idx["block-manager"]["file bytes available for reuse"] || 0;
                }
              });
            } else {
              indexDetailsStatus = "unknown_shape";
            }

            if (indexDetailsStatus === "available" && indexReuseBytes === 0 && totalIndexSize > 0) {
              indexDetailsStatus = "available_zero_reuse";
            }
          } else {
            indexDetailsStatus = "no_storage_stats";
          }

          results.push({
            ns: ns,
            collectionReuseBytes: collectionReuseBytes,
            indexReuseBytes: indexReuseBytes,
            totalIndexSize: totalIndexSize,
            totalFreeBytes: collectionReuseBytes + indexReuseBytes,
            indexDetailsStatus: indexDetailsStatus
          });
          totalCollectionReuseBytes += collectionReuseBytes;
          totalIndexReuseBytes += indexReuseBytes;
          totalIndexSizeBytes += totalIndexSize;
          if (indexDetailsStatus !== "available" && indexDetailsStatus !== "available_zero_reuse") {
            namespacesWithUnavailableIndexDetails += 1;
          }
        }
      } catch (error) {
        print("Error processing collection '" + collectionName + "': " + error.message);
      }
    });
  }
});


results.sort((a, b) => b.totalFreeBytes - a.totalFreeBytes);


print("ns,collection_reuse_bytes,index_reuse_bytes,total_index_size_bytes");
results.forEach(result => {
  print(
    result.ns + "," + result.collectionReuseBytes + "," + result.indexReuseBytes + "," + result.totalIndexSize
  );
});

print("total_collection_reuse_bytes," + totalCollectionReuseBytes);
print("total_index_reuse_bytes," + totalIndexReuseBytes);
print("total_index_size_bytes," + totalIndexSizeBytes);
print("namespaces_with_unavailable_index_details," + namespacesWithUnavailableIndexDetails);
