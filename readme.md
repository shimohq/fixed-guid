# fixed-guid

# Install

`npm install fixed-guid`

# How to Use

```javascript
const IORedis = require('ioredis')
const FixedGuid = require('fixed-guid')

const fixedGuid = new FixedGuid({
  redis: new IORedis()
})

const main = async () => {
  const guid = await FixedGuid.run()
}

main().catch(console.log)
```

`guid` is a uuid, next time you run the script, the guid will be as the same as this one.
If you have multiple processes, the order of the guids will be almost guaranteed
if some process will not be run any more, the guid will be deleted after 30min

# LICENSE

MIT