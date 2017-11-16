const _ = require('lodash')
const Bluebird = require('bluebird')
const IORedis = require('ioredis')
const uuid = require('uuid/v4')
const Redlock = require('redlock')

class FixedGuid {
  /**
   * Constructor
   *
   * @param {Object} [options]
   * @param {Object} [options.redis] the ioredis client
   * @param {Object} [options.key] the ioredis client
   */
  constructor (options) {
    options = options || {}
    _.assign(this, {
      key: 'fixed-id',
      lockTTL: 6000,
      heartbeatInterval: 3000,
      // Delete guid if is not active
      deadTime: 1800000
    }, options)

    if (!this.redis) {
      this.redis = new IORedis(options.redisOption)
    }

    this.redlock = new Redlock([this.redis])
  }

  async register () {
    const guid = uuid()
    await this.redis.hset(this.key, guid, Date.now())
    await this.take(guid)
  }

  async start () {
    await this.underLock(async () => {
      const obj = await this.redis.hgetall(this.key)
      if (_.isEmpty(obj)) {
        return this.register()
      }
      const inverted = _.invert(obj)
      const dates = Object.keys(inverted).map(Number)

      const outdates = _.remove(dates, num => Date.now() - num > this.deadTime)
      if (outdates.length > 0) {
        await Bluebird.all(outdates.map(n => {
          return this.redis.hdel(this.key, inverted[n])
        }))
      }

      if (dates.length === 0) {
        return this.register()
      }

      const min = _.min(dates)
      const needCheck = Date.now() - min < this.heartbeatInterval

      const guid = inverted[min]
      await this.take(guid, needCheck)
    })
  }

  async take (guid, needCheck) {
    const now = Date.now()
    await this.redis.hset(this.key, guid, now)
    if (!needCheck) {
      this.guid = guid
      this.heartbeat()
      return
    }

    await Bluebird.delay(this.heartbeatInterval)
    const newNow = Number(await this.redis.hget(this.key, guid))
    if (newNow !== now) {
      return this.register()
    }

    this.guid = guid
    this.heartbeat()
  }

  async heartbeat () {
    await Bluebird.delay(this.heartbeatInterval)
    await this.redis.hset(this.key, this.guid, Date.now())
    await this.heartbeat()
  }

  async underLock (fn, ...params) {
    const lock = await this.redlock.lock(this.key + '-lock', this.lockTTL)
    try {
      await fn(...params)
    } catch (e) {
      console.error('Unlock resource failed, exit')
      throw e
    }
    await lock.unlock()
  }

  async run () {
    await this.start()
    return this.guid
  }
}

module.exports = FixedGuid
