# collstats
Print Statistics for all collections in a database using  `dbcollection.stats( { indexDetails : true } )` output in JSON format

## To Run
Change the first two lines, name for database we want statisticss  and provide  name of the cluster
```
var StatsOnlyForDB ="sample_training"
var clusterName = "USPROD-2"
```

In the Connection String , provide a user that only have **READ ACCESS** with these roles
_roles: [ "backup", "readAnyDatabase", "clusterMonitor" ]_

> monogsh "connection string" getDBStats.js > ClusterName-ouput.js
