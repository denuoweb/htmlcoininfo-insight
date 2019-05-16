const path = require('path')
const _require = require('esm')(module)

module.exports = {
  get htmlcoininfo() {
    return {
      lib: _require(path.resolve(this.config.htmlcoininfo.path, 'packages', 'htmlcoininfo-lib')),
      rpc: _require(path.resolve(this.config.htmlcoininfo.path, 'packages', 'htmlcoininfo-rpc')).default
    }
  }
}
