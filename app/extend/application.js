const path = require('path')
const _require = require('esm')(module)

const CHAIN = Symbol('htmlcoin.chain')

module.exports = {
  get chain() {
    this[CHAIN] = this[CHAIN] || this.htmlcoininfo.lib.Chain.get(this.config.htmlcoin.chain)
    return this[CHAIN]
  },
  get htmlcoininfo() {
    return {
      lib: _require(path.resolve(this.config.htmlcoininfo.path, 'packages', 'htmlcoininfo-lib')),
      rpc: _require(path.resolve(this.config.htmlcoininfo.path, 'packages', 'htmlcoininfo-rpc')).default
    }
  }
}
