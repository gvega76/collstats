var results = [];
var totalCollectionReuseBytes = 0n;
var totalIndexReuseBytes = 0n;
var totalIndexSizeBytes = 0n;
var namespacesWithUnavailableIndexDetails = 0;

function toBigIntBytes(value) {
  if (value === null || value === undefined) {
    return 0n;
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string") {
    return value ? BigInt(value) : 0n;
  }

  if (typeof value.toString === "function") {
    var stringValue = value.toString();
    return stringValue ? BigInt(stringValue) : 0n;
  }

  return 0n;
}

db.getSiblingDB("admin").runCommand({ listDatabases : 1 } ).databases.forEach(d => {
  if (!["admin", "config", "local"].includes(d.name) && !d.name.startsWith("__mdb_internal")) {
    db.getSiblingDB(d.name).getCollectionNames().forEach( collectionName => {
      try {
        var doc = db.getSiblingDB(d.name).getCollection(collectionName).aggregate([
          { $collStats: { storageStats: {} } }
        ]).next();
        
        if (doc) {
          var ns = doc.ns || "";
          var collectionReuseBytes = 0n;
          var indexReuseBytes = 0n;
          var totalIndexSize = 0n;
          var indexDetailsStatus = "available";

          if (
            doc.storageStats &&
            doc.storageStats.wiredTiger &&
            doc.storageStats.wiredTiger["block-manager"]
          ) {
            collectionReuseBytes =
              toBigIntBytes(
                doc.storageStats.wiredTiger["block-manager"]["file bytes available for reuse"]
              );
          }

          if (doc.storageStats) {
            totalIndexSize = toBigIntBytes(doc.storageStats.totalIndexSize);

            var indexDetails = doc.storageStats.indexDetails;

            if (!indexDetails) {
              indexDetailsStatus = "not_exposed";
            } else if (Array.isArray(indexDetails)) {
              indexDetails.forEach(function (idx) {
                idx = idx || {};
                if (idx["block-manager"]) {
                  indexReuseBytes += toBigIntBytes(
                    idx["block-manager"]["file bytes available for reuse"]
                  );
                }
              });
            } else if (typeof indexDetails === "object") {
              Object.keys(indexDetails).forEach(function (idxName) {
                var idx = indexDetails[idxName] || {};
                if (idx["block-manager"]) {
                  indexReuseBytes += toBigIntBytes(
                    idx["block-manager"]["file bytes available for reuse"]
                  );
                }
              });
            } else {
              indexDetailsStatus = "unknown_shape";
            }

            if (indexDetailsStatus === "available" && indexReuseBytes === 0n && totalIndexSize > 0n) {
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


results.sort((a, b) => {
  if (a.totalFreeBytes === b.totalFreeBytes) {
    return 0;
  }

  return a.totalFreeBytes > b.totalFreeBytes ? -1 : 1;
});


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


