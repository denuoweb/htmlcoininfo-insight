const path = require('path')
const Redis = require('ioredis')

exports.keys = 'htmlcoininfo-insight-mainnet'

exports.security = {
  csrf: {enable: false}
}

exports.middleware = ['notfound', 'cors', 'ratelimit']

exports.ratelimit = {
  db: new Redis({
    host: 'localhost',
    port: 6379,
    db: 0
  }),
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total',
  },
  disableHeader: false,
  id: ctx => `htmlcoininfo-insight-mainnet-${ctx.get('x-forwarded-for') || ctx.ip}`,
  errorMessage: 'Rate Limit Exceeded',
  duration: 10 * 60 * 1000,
  max: 10 * 60
}

exports.sequelize = {
  Sequelize: require('sequelize'),
  dialect: 'mysql',
  database: 'htmlcoin_mainnet',
  host: 'localhost',
  port: 3306,
  username: 'htmlcoin',
  password: ''
}

exports.htmlcoin = {
  chain: 'mainnet'
}

exports.htmlcoininfo = {
  path: path.resolve('..', 'htmlcoininfo'),
  port: 3001,
  rpc: {
    protocol: 'http',
    host: 'localhost',
    port: 3889,
    user: 'user',
    password: 'password'
  }
}
