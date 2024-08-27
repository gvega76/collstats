# collstats
Get Statistics from collection.stats(), and indexDetails output in JSON format

## To Run
Change the first two lines, to the database we want statiscts from and the give cluster name 
```
var StatsOnlyForDB ="sample_training"
var clusterName = "USPROD-2"
```

In the Connection String , provide a user that only have **READ ACCESS** with these roles
_roles: [ "backup", "readAnyDatabase", "clusterMonitor" ]_

> monogsh <connection string> getDBStats.js > ClusterName-ouput.js